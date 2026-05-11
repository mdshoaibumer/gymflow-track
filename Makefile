.PHONY: help dev-backend dev-frontend install-backend install-frontend migrate lint

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# === Development ===

dev-backend: ## Run backend dev server
	cd backend && uvicorn app.main:app --reload --port 8000

dev-frontend: ## Run frontend dev server
	cd frontend && npm run dev

# === Setup ===

install-backend: ## Install backend dependencies
	cd backend && pip install -r requirements.txt

install-frontend: ## Install frontend dependencies
	cd frontend && npm install

# === Database ===

migrate: ## Run database migrations
	cd backend && alembic upgrade head

migrate-create: ## Create new migration (usage: make migrate-create msg="description")
	cd backend && alembic revision --autogenerate -m "$(msg)"

# === Docker (Development) ===

up: ## Start all services (dev)
	docker-compose up -d

down: ## Stop all services (dev)
	docker-compose down

db-only: ## Start only database (dev)
	docker-compose up -d db

# === Docker (Production) ===

prod-up: ## Start production stack
	docker compose -f docker-compose.prod.yml up -d

prod-down: ## Stop production stack
	docker compose -f docker-compose.prod.yml down

prod-build: ## Build production images
	docker compose -f docker-compose.prod.yml build --no-cache

prod-logs: ## Tail production logs
	docker compose -f docker-compose.prod.yml logs -f --tail=50

prod-ps: ## Show production container status
	docker compose -f docker-compose.prod.yml ps

prod-migrate: ## Run migrations in production
	docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

prod-backup: ## Create production database backup
	./scripts/backup-db.sh

prod-deploy: ## Full production deployment
	./scripts/deploy.sh

# === Quality ===

lint: ## Run linters
	cd backend && ruff check .
	cd frontend && npm run lint
