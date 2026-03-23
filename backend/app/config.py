from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_password: str = "changeme"
    data_dir: str = "/data"
    db_path: str = "/data/notescribe.db"
    max_upload_size_mb: int = 500
    session_ttl_hours: int = 24
    cors_origins: str = ""

    model_config = {"env_prefix": "NOTESCRIBE_"}


settings = Settings()
