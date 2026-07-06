"""Cliente Supabase (Postgres via PostgREST) usado pelo worker e pelo serviço de quiz.

O worker usa a service_role key: bypassa RLS e pode fazer upsert nas tabelas
biosphere_*. Nunca exponha essa key no app Expo.
"""

from __future__ import annotations

from supabase import Client, create_client

from .config import Settings


def get_supabase(settings: Settings) -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
