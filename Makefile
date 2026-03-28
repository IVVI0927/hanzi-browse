.PHONY: dev fresh setup install build db migrate clean stop help check-prereqs symlinks test

# Load .env if it exists
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# ─── Main commands ───────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

fresh: check-prereqs .env install build ## First-time setup: prereqs, env, deps, build, DB, migrate, start
	@echo ""
	@echo "  Starting fresh environment..."
	@echo ""
	@$(MAKE) db
	@echo "  Waiting for Postgres to be ready..."
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		docker compose exec -T postgres pg_isready -U hanzi -q 2>/dev/null && break; \
		sleep 1; \
	done
	@$(MAKE) migrate
	@echo ""
	@echo "  ✓ Postgres running on localhost:5433"
	@echo "  ✓ Schema migrated"
	@echo ""
	@echo "  Starting managed server on http://localhost:3456"
	@echo "  Dashboard at http://localhost:3456/dashboard"
	@echo "  Docs at http://localhost:3456/docs.html"
	@echo ""
	@cd server && node dist/managed/deploy.js

dev: .env ## Start everything for local development
	@echo ""
	@echo "  Starting Hanzi dev environment..."
	@echo ""
	@$(MAKE) db
	@echo "  Waiting for Postgres to be ready..."
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		docker compose exec -T postgres pg_isready -U hanzi -q 2>/dev/null && break; \
		sleep 1; \
	done
	@$(MAKE) migrate
	@echo ""
	@echo "  ✓ Postgres running on localhost:5433"
	@echo "  ✓ Schema migrated"
	@echo ""
	@echo "  Starting managed server on http://localhost:3456"
	@echo "  Dashboard at http://localhost:3456/dashboard"
	@echo "  Docs at http://localhost:3456/docs.html"
	@echo ""
	@cd server && node dist/managed/deploy.js

setup: .env check-prereqs install build symlinks ## Install deps + build + create symlinks
	@echo "  ✓ Setup complete"

check-prereqs: ## Validate required tools are installed
	@echo "  Checking prerequisites..."
	@command -v node >/dev/null 2>&1 || { echo "  ✗ Node.js not found. Install Node 18+: https://nodejs.org/"; exit 1; }
	@NODE_MAJOR=$$(node -e "console.log(process.versions.node.split('.')[0])"); \
	if [ "$$NODE_MAJOR" -lt 18 ] 2>/dev/null; then \
		echo "  ✗ Node.js $$(node --version) is too old. Need 18+: https://nodejs.org/"; exit 1; \
	fi
	@command -v docker >/dev/null 2>&1 || { echo "  ✗ Docker not found. Install: https://docs.docker.com/get-docker/"; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "  ✗ Docker is not running. Start Docker Desktop and try again."; exit 1; }
	@(docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1) || { echo "  ✗ Docker Compose not found. It should come with Docker Desktop."; exit 1; }
	@echo "  ✓ Node $$(node --version), Docker $$(docker --version | awk '{print $$3}' | tr -d ',')"

install: ## Install all dependencies
	@echo "  Installing dependencies..."
	@npm install --silent 2>/dev/null || true
	@cd server && npm install --silent 2>/dev/null || true
	@cd server/dashboard && npm install --silent 2>/dev/null || true
	@echo "  ✓ Dependencies installed"

build: ## Build server + dashboard + extension
	@echo "  Building..."
	@cd server && npm run build 2>&1 | tail -1
	@echo "  ✓ Build complete"

symlinks: ## Create symlinks for local serving (landing, sdk)
	@ln -sf ../landing server/landing 2>/dev/null || true
	@ln -sf ../sdk server/sdk 2>/dev/null || true

db: ## Start Postgres (Docker)
	@docker info >/dev/null 2>&1 || { echo "  ✗ Docker is not running. Start Docker Desktop and try again."; exit 1; }
	@docker compose up -d postgres 2>/dev/null || docker-compose up -d postgres 2>/dev/null || { echo "  ✗ Docker Compose failed. Is Docker running?"; exit 1; }

migrate: ## Run database migrations
	@docker compose exec -T postgres psql -U hanzi -d hanzi -f /docker-entrypoint-initdb.d/schema.sql -q 2>/dev/null \
		|| { echo "  ⚠ Migration failed — is Postgres running? Try: make db"; exit 1; }
	@echo "  ✓ Schema migrated"

stop: ## Stop all services
	@docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
	@echo "  ✓ Services stopped"

clean: stop ## Stop services and remove data
	@docker compose down -v 2>/dev/null || docker-compose down -v 2>/dev/null || true
	@echo "  ✓ Cleaned up"

test: ## Run tests
	@cd server && npx vitest run

# ─── Helpers ─────────────────────────────────────────

.env:
	@cp .env.example .env
	@echo "  Created .env from .env.example — edit if you need Google OAuth or Stripe."
