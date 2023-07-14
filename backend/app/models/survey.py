from datetime import datetime
from enum import Enum, IntEnum
from typing import List, Optional

from bson import ObjectId
from pydantic import BaseModel, Field, validator

from app.models.customs import CustomJsonEncoder, IvField


class SurveySecretKeyModel(IvField):
    cipher_text: str = Field(
        ...,
        max_length=240,
        description="Xchacha20 secret key, encrypted with keychain, base64 encoded",
    )


class SurveySignPublicKeyModel(BaseModel):
    public_key: str = Field(
        ..., max_length=44, description="ed25519 public key, base64 encoded"
    )


class SurveySignKeyPairModel(SurveySignPublicKeyModel, IvField):
    cipher_text: str = Field(
        ...,
        max_length=240,
        description="ed25519 private key, encrypted with keychain, base64 encoded",
    )


class SurveyKeypairCipherModel(IvField):
    cipher_text: str = Field(
        ...,
        max_length=240,
    )


class SurveyPublicKeyModel(BaseModel):
    public_key: SurveyKeypairCipherModel


class SurveyKeypairModel(SurveyPublicKeyModel):
    private_key: SurveyKeypairCipherModel


class SurveyRegexModel(IvField):
    cipher_text: str = Field(
        ...,
        max_length=128,
    )


class SurveyDescriptionModel(IvField):
    cipher_text: str = Field(
        ...,
        max_length=1024,
    )


class SurveyChoicesModel(IvField):
    id: int = Field(..., ge=0, lt=1024)
    cipher_text: str = Field(
        ...,
        max_length=512,
    )


class SurveyQuestionsModel(IvField):
    cipher_text: str = Field(
        ...,
        max_length=256,
    )


class SurveyQuestionType(int, Enum):
    ShortAnswer = 0
    Paragraph = 1
    MultipleChoice = 2
    SingleChoice = 3


class SurveyQuestionModel(BaseModel):
    id: int = Field(..., ge=0, lt=1024)
    regex: Optional[SurveyRegexModel] = None
    description: Optional[SurveyDescriptionModel] = None
    question: SurveyQuestionsModel
    choices: Optional[List[SurveyChoicesModel]] = Field(None, max_items=56)
    required: bool = False
    type: SurveyQuestionType

    @validator("choices")
    def choices_validator(
        cls, v: Optional[List[SurveyChoicesModel]]
    ) -> Optional[List[SurveyChoicesModel]]:
        if not v:
            return v

        ids = [q.id for q in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate choices ids")
        return v


class TitleModel(IvField):
    cipher_text: str = Field(
        ...,
        max_length=128,
    )


class __SurveySharedModel(BaseModel):
    title: TitleModel
    description: Optional[SurveyDescriptionModel] = None
    questions: List[SurveyQuestionModel] = Field(..., max_items=128)
    signature: str = Field(..., max_length=128)
    requires_login: bool = False
    proxy_block: bool = False
    allow_multiple_submissions: bool = False
    algorithms: str = Field(
        "XChaCha20Poly1305+ED25519+X25519_XSalsa20Poly1305+BLAKE2b",
        description="Encryption algorithms used for survey",
    )

    @validator("questions")
    def questions_validator(
        cls, v: List[SurveyQuestionModel]
    ) -> List[SurveyQuestionModel]:
        ids = [q.id for q in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate question ids")
        return v


class SurveyCreateModel(__SurveySharedModel):
    sign_keypair: SurveySignKeyPairModel
    secret_key: SurveySecretKeyModel
    keypair: SurveyKeypairModel


class SurveyPublicModel(__SurveySharedModel, CustomJsonEncoder):
    created: datetime
    id: ObjectId = Field(..., alias="_id")
    user_id: ObjectId
    sign_keypair: SurveySignPublicKeyModel
    keypair: SurveyPublicKeyModel


class SurveyModel(SurveyPublicModel, SurveyCreateModel):
    sign_keypair: SurveySignKeyPairModel
    keypair: SurveyKeypairModel
    secret_key: SurveySecretKeyModel


class SurveyAnswerModel(BaseModel):
    id: int = Field(..., ge=0, lt=1024)
    # For simplicity of data types, every answer is stored
    # as an array regardless of the question type.
    answer: List[str] = Field(..., min_items=1, max_items=56)
    type: SurveyQuestionType
