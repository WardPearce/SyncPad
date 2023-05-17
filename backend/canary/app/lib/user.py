from typing import TYPE_CHECKING

from app.errors import UserNotFoundException
from app.models.user import UserModel

if TYPE_CHECKING:
    from app.types import State


class User:
    def __init__(self, state: "State", email: str) -> None:
        self.state = state
        self.email = email

    @property
    def __email_query(self) -> dict:
        return {"email": self.email}

    async def exists(self) -> None:
        """Check if user exists.

        Raises:
            UserNotFoundException
        """

        if await self.state.mongo.user.count_documents(self.__email_query) == 0:
            raise UserNotFoundException()

    async def get(self) -> UserModel:
        """Get user account details.

        Raises:
            UserNotFoundException

        Returns:
            UserModel
        """

        user = await self.state.mongo.user.find_one(self.__email_query)
        if not user:
            raise UserNotFoundException()
        return UserModel(**user)