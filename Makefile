# ADB Studio — alvos comuns (detalhes em docs/DEVELOPMENT.md)

.PHONY: help install dev build test test-rust test-frontend check check-deps perf clean

help:
	@echo "Alvos:"
	@echo "  make install        npm install"
	@echo "  make dev            frontend no navegador (modo demo, porta 1420)"
	@echo "  make dev-tauri      app desktop completo (npm run tauri:dev)"
	@echo "  make build          build de produção do frontend"
	@echo "  make bundle         AppImage + .deb (npm run tauri:build)"
	@echo "  make test           frontend + Rust (o que estiver disponível)"
	@echo "  make test-rust      cargo test em src-tauri/"
	@echo "  make test-frontend  vitest"
	@echo "  make check          tsc + testes"
	@echo "  make check-deps     scripts/check-deps.sh"
	@echo "  make perf           scripts/measure-performance.sh"
	@echo "  make clean          limpa dist/ e alvos de teste locais"

install:
	npm install

dev:
	npm run dev

dev-tauri:
	npm run tauri:dev

build:
	npm run build

bundle:
	npm run tauri:build

test: test-frontend test-rust

test-rust:
	cd src-tauri && cargo test

test-frontend:
	npm test

check:
	npx tsc --noEmit
	npm test
	@command -v cargo >/dev/null 2>&1 && (cd src-tauri && cargo test) || echo "cargo não disponível — pulei os testes Rust"

check-deps:
	bash scripts/check-deps.sh

perf:
	bash scripts/measure-performance.sh

clean:
	rm -rf dist
