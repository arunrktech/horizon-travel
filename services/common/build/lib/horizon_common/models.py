"""Base model so every API payload uses camelCase JSON, matching frontend/src/api/types.ts."""
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class Page(ApiModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int


class Health(ApiModel):
    status: str = "ok"
