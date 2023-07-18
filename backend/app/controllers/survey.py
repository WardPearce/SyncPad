from datetime import datetime
from typing import TYPE_CHECKING, Any, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from litestar import Request, Router
from litestar.contrib.jwt import Token
from litestar.controller import Controller
from litestar.handlers import get, post

from app.errors import InvalidAccountAuth, SurveyNotFoundException
from app.lib.geoip import GeoIp
from app.lib.mCaptcha import validate_captcha
from app.lib.survey import Survey

if TYPE_CHECKING:
    from app.custom_types import State

from app.models.survey import (
    SubmitSurveyModel,
    SurveyCreateModel,
    SurveyModel,
    SurveyPublicModel,
)


@post("/create", description="Create a survey")
async def create_survey(
    request: Request[ObjectId, Token, Any], data: SurveyCreateModel, state: "State"
) -> SurveyModel:
    insert = {**data.dict(), "created": datetime.utcnow(), "user_id": request.user}
    await state.mongo.survey.insert_one(insert)
    return SurveyModel(**insert)


@get("/list", description="List surveys")
async def list_surveys(
    request: Request[None, Token, Any], state: "State"
) -> List[SurveyModel]:
    surveys: List[SurveyModel] = []
    async for survey in state.mongo.survey.find({"user_id": request.user}):
        surveys.append(SurveyModel(**survey))
    return surveys


class SurveyController(Controller):
    path = "/{survey_id:str}"

    @post("/submit", description="Submit answers to a survey", exclude_from_auth=True)
    async def submit_survey(
        self,
        state: "State",
        request: Request[Optional[ObjectId], Token, Any],
        survey_id: str,
        data: SubmitSurveyModel,
        captcha: Optional[str] = None,
    ) -> None:
        try:
            id_ = ObjectId(survey_id)
        except InvalidId:
            raise SurveyNotFoundException()

        survey = await Survey(state, id_).get()

        if survey.requires_captcha:
            await validate_captcha(state, captcha)

        user_id = None
        if request.user:
            user_id = request.user
        elif survey.requires_login:
            raise InvalidAccountAuth()

        if not survey.allow_multiple_submissions:
            pass

        if survey.proxy_block and request.client and request.client.host:
            geoip_lookup = await GeoIp(state, request.client.host).get()
            if geoip_lookup and geoip_lookup["proxy"] == "yes":
                pass

        await Survey(state, id_).submit_answers(data, user_id=user_id)

    @get("/public", cache=120, description="Get a survey", exclude_from_auth=True)
    async def public_survey(
        self,
        state: "State",
        request: Request[Optional[ObjectId], Token, Any],
        survey_id: str,
    ) -> SurveyPublicModel:
        try:
            id_ = ObjectId(survey_id)
        except InvalidId:
            raise SurveyNotFoundException()

        survey = await Survey(state, id_).public()

        if survey.requires_login and not request.user:
            raise InvalidAccountAuth()

        return survey


router = Router(
    path="/survey",
    tags=["survey"],
    route_handlers=[SurveyController, create_survey, list_surveys],
)
