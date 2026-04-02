# Mealie Development Guide

## Project Overview

Mealie is a self-hosted recipe manager and meal planner. This is a fork at `DeepReef11/mealie` based on `mealie-recipes/mealie`.

- **Backend**: Python 3.12, FastAPI, SQLAlchemy ORM, Alembic migrations
- **Frontend**: Vue 3 / Nuxt, Vuetify 3, TypeScript
- **Database**: SQLite or PostgreSQL (prod uses Postgres)
- **Package manager**: `uv` for Python, `yarn` for frontend

## Repository Structure

```
mealie/              # Backend Python package
  app.py             # FastAPI app setup, scheduler registration
  core/              # Config, settings, logging
  db/models/         # SQLAlchemy models
  schema/            # Pydantic schemas (API contracts)
  repos/             # Repository pattern (data access layer)
  routes/            # FastAPI route controllers
  services/          # Business logic services
  alembic/versions/  # Database migrations
frontend/            # Nuxt/Vue frontend
  pages/             # Route pages
  components/        # Vue components
  composables/       # Vue 3 composition API utilities
  lib/api/           # Typed API clients
  lib/icons/         # MDI icon registry
  lang/messages/     # i18n translations
docker/              # Dockerfile, entry scripts
```

## Key Patterns

### Backend

- **Settings**: `mealie/core/settings/settings.py` — env vars via pydantic-settings `BaseSettings`
- **Feature flags**: `FeatureDetails(enabled, description)` pattern, `*_FEATURE` property + `*_ENABLED` bool
- **Models**: SQLAlchemy with `@auto_init()` decorator, `@api_extras` for key-value extras
- **Schemas**: Pydantic models with `loader_options()` for eager loading, `model_config = ConfigDict(from_attributes=True)`
- **Repos**: `RepositoryGeneric[Schema, Model]` base, `GroupRepositoryGeneric`, `HouseholdRepositoryGeneric`
- **Controllers**: `BaseUserController` (has `self.household`, `self.repos`, `self.user`), `BaseCrudController` (adds event bus)
- **Events**: `EventBusService.dispatch()` → listeners (Apprise, Webhooks) via `BackgroundTasks`
- **Scheduler**: `SchedulerRegistry.register_daily/hourly/minutely/every_minute()` in `app.py`
- **Migrations**: Alembic with `op.batch_alter_table()`, supports both SQLite and Postgres

### Frontend

- **API clients**: `useUserApi()`, `useAdminApi()`, `usePublicApi()` composables
- **Household data**: `useHouseholdSelf()` returns `{ household, actions }` — shared ref
- **Preferences**: `householdActions.updatePreferences()` for save, bind directly to `household.preferences.*`
- **Auth middleware**: `middleware: ["can-manage-household-only"]` on pages requiring auth
- **Icons**: Import from `@mdi/js` in `frontend/lib/icons/icons.ts`, use via `$globals.icons.*`
- **i18n**: Keys in `frontend/lang/messages/en-US.json`, use `$t('section.key')` in templates
- **Types**: `frontend/lib/api/types/admin.ts` and `household.ts` — auto-generated from Pydantic, update manually for new fields
- **Admin sidebar**: `frontend/layouts/admin.vue` `topLinks` array
- **Shopping list queue**: Frontend batches item updates — checkbox clicks don't immediately call PUT API

## Building & Testing

### Docker Build

```bash
docker build --network=host -t mealie-dev -f docker/Dockerfile .
```

### Running Dev Mealie

```bash
docker run -d --name mealie-dev -p 9930:9000 \
  -e PRODUCTION=true -e ALLOW_SIGNUP=true -e DB_ENGINE=sqlite \
  mealie-dev
```

Default login: `changeme@example.com` / `MyPassword`

### Dev Nextcloud for Testing Sync

```bash
docker compose -f docker-compose.nextcloud-dev.yml up -d
# Wait 30s, then:
docker exec mealie-nc-dev bash -c "php occ app:install tasks && php occ app:enable tasks"
```

### Testing with Playwright MCP

The Mealie frontend uses Vuetify which has quirks with Playwright:

- **v-switch clicks**: Playwright's accessibility click on checkboxes may not toggle Vuetify switches. Use `page.evaluate()` to click the underlying input: `document.querySelector('.v-switch input').click()`
- **Auth**: Setting cookie via `document.cookie = 'mealie.access_token=...'` works for API calls but the frontend's Axios interceptor may not pick it up. The shopping list queue system won't work without proper Nuxt auth flow.
- **API testing**: For reliable testing, use `page.evaluate()` with `fetch()` and the auth token directly rather than clicking UI elements.

### Testing Sync End-to-End

1. Create Nextcloud CalDAV service in Python:
```python
from mealie.services.nextcloud.caldav import NextcloudTasksService
nc = NextcloudTasksService(url='http://...', username='admin', password='admin123', task_list='tasks', verify_ssl=False)
```

2. Use `nc.create_todo()`, `nc.complete_todo()`, `nc.list_todos()` to manipulate NC side
3. Use Mealie API via `fetch()` in Playwright to trigger sync (GET on shopping list triggers pull)
4. Verify both sides after each operation

## Production Deployment

- **Proliant server**: 192.168.0.151, user `services`
- **Prod Mealie**: port 9925, Postgres DB, data at `/datastorage/mealie`
- **Prod Nextcloud**: port 8080 (DO NOT use for dev testing)
- **Compose**: `/home/services/mealie/docker-compose.yml`
- **Backup**: `docker exec mealie-postgres pg_dump -U mealie mealie > backup.sql`

## Nextcloud Tasks Integration

- **Config**: Stored in `household_preferences` table (opt-in per household)
- **CalDAV**: Sync `httpx.Client` in `mealie/services/nextcloud/caldav.py`
- **Sync**: `mealie/services/nextcloud/sync.py` — bidirectional with 3-layer dedup
- **RELATED-TO parsing**: Must match both `RELATED-TO;RELTYPE=PARENT:uid` (RFC) and `RELATED-TO:uid` (Nextcloud default)
- **Extras for UID tracking**: Use `_set_extra()` / `_get_list_extra()` direct SQL — never update the full shopping list object just to change extras
