from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text, inspect

from app.core.config import settings
from app.models.base import Base

# Import all models so Alembic can detect them
from app.models.gym import Gym  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.member import Member  # noqa: F401
from app.models.payment import Payment  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.attendance import Attendance  # noqa: F401
from app.models.asset import Asset, MaintenanceRecord  # noqa: F401
from app.models.feedback import Feedback  # noqa: F401
from app.models.subscription import SubscriptionPlan, GymSubscription, Invoice  # noqa: F401
from app.models.auth_token import RefreshToken, PasswordResetToken  # noqa: F401

config = context.config

# Override sqlalchemy.url from env
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Maximum allowed length for revision identifiers.
# Alembic's default alembic_version.version_num is VARCHAR(32) which is too
# short for descriptive revision IDs. We widen it on first connect.
_VERSION_NUM_MAX_LENGTH = 128


def _widen_alembic_version_column(connection) -> None:
    """Widen alembic_version.version_num to avoid truncation errors.

    Alembic creates version_num as VARCHAR(32) by default. Descriptive
    revision IDs like '012_payment_idempotency_and_token_grace' exceed this.
    This function safely widens the column if the table already exists.
    Also handles renaming the old oversized revision ID if it was partially
    stamped before this fix was applied.
    """
    insp = inspect(connection)
    if not insp.has_table("alembic_version"):
        return  # Table will be created by Alembic with proper width

    columns = {c["name"]: c for c in insp.get_columns("alembic_version")}
    ver_col = columns.get("version_num")
    if ver_col and hasattr(ver_col["type"], "length") and ver_col["type"].length < _VERSION_NUM_MAX_LENGTH:
        connection.execute(text(
            f"ALTER TABLE alembic_version "
            f"ALTER COLUMN version_num TYPE VARCHAR({_VERSION_NUM_MAX_LENGTH})"
        ))
        connection.commit()

    # If the old oversized revision ID was somehow stamped, rename it
    result = connection.execute(text(
        "SELECT version_num FROM alembic_version "
        "WHERE version_num LIKE '012_payment_idempotency%'"
    ))
    old_row = result.fetchone()
    if old_row:
        connection.execute(text(
            "UPDATE alembic_version SET version_num = '012_pay_idem_token_grace' "
            "WHERE version_num LIKE '012_payment_idempotency%'"
        ))
        connection.commit()


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_pk=False,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # Widen version_num column before Alembic tries to stamp it
        _widen_alembic_version_column(connection)

        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
