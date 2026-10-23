"""Apply SQL migrations in db/migrations in filename order, once each.

Usage:  DATABASE_URL=postgresql://user:pass@host:5432/horizon python db/migrate.py
In AWS this runs as a one off ECS task before a deployment.
"""
import os
import sys
from pathlib import Path

import psycopg

MIGRATIONS = Path(__file__).parent / "migrations"


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set.", file=sys.stderr)
        return 1
    url = url.replace("postgresql+psycopg://", "postgresql://")
    with psycopg.connect(url, autocommit=False) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS public.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        done = {r[0] for r in conn.execute("SELECT version FROM public.schema_migrations")}
        for path in sorted(MIGRATIONS.glob("*.sql")):
            if path.name in done:
                continue
            print(f"Applying {path.name}")
            conn.execute(path.read_text())
            conn.execute("INSERT INTO public.schema_migrations (version) VALUES (%s)", (path.name,))
        conn.commit()
    print("Migrations up to date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
