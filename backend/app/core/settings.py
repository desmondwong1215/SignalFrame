from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    groq_api_key: str = ""
    explanation_provider: str = "auto"
    groq_model: str = "llama-3.3-70b-versatile"

    model_config = SettingsConfigDict(
        env_file=("backend/.env", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = AppSettings()
