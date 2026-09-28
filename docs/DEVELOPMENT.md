# Desenvolvimento

## Toolchain

- **Node** ≥ 20 (LTR), **Rust** estável (edition 2021). Instale o Rust pelo [rustup](https://rustup.rs/) e abra um novo terminal para carregar o `cargo` no `PATH`. O `tauri-cli` v2 é instalado como dependência de desenvolvimento pelo `npm install`.
- **Dependências de sistema do Tauri 2 (Debian/Ubuntu):**
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```
- **Ferramentas Android (aplicativo, não do toolchain):**
  ```bash
  sudo apt install adb scrcpy        # ou baixe platform-tools da Android
  ```

## Setup

```bash
git clone <repo> && cd wadb
npm install
```

## Rodar

| Comando | O que faz |
|---|---|
| `npm run dev` | Frontend no navegador em `http://localhost:1420` (**modo demo**: dispositivos simulados via `MockBridge`). |
| `npm run tauri:dev` | App desktop completo (frontend + Rust), porta 1420. |
| `npm run tauri:build` | Bundle release: **AppImage** e **.deb** em `src-tauri/target/release/bundle/`. |
| `npm test` | Testes do frontend (vitest): i18n, presets, MockBridge, diálogo de confirmação. |
| `make test-rust` | Testes do backend: `cargo test` em `src-tauri/` (unitários + integração com `fake-adb`). |
| `make check` | `tsc --noEmit` + `vitest` + `cargo test` (o que for disponível). |

## Scripts

- `scripts/check-deps.sh` — verifica se `adb`, `scrcpy` e `fastboot` existem e imprime versões (idêntico ao que o app faz em "Configurações").
- `scripts/measure-performance.sh` — mede o que a spec §15 pede sem telemetria: tempo de `adb devices`, `adb get-state`, e consumo de memória do próprio processo (sem coletar métricas contínuas).

## Flatpak (alvo adicional)

O bundle principal é AppImage + .deb (`tauri.conf.json → bundle.targets`). Para Flatpak:

1. Crie um `.flatpakref`/manifest (ex.: `flatpak/adb-studio.json`) herdando a runtime `org.freedesktop.Platform` 24.08 com SDK webkitgtk-4.1.
2. Empacote `adb`/`scrcpy` como extensão do Flatpak **ou** permita o host via `talk-name` — o app detecta as ferramentas no PATH, então basta expor os binários no sandbox.
3. `flatpak build` com `npm ci && npm run build` e o binário release do Tauri.

(Isso está fora do escopo de build automático deste repo; a configuração de bundle Tauri já cobre AppImage/.deb.)

## Estrutura de commits

- Mensagens em pt-BR ou en-US, imperativo ("adiciona", "adiciona flag…").
- Separe mudanças de segurança (validação, confirmações) para revisão dedicada.

## Debug

- **Log do app:** `~/.local/share/com.wadb.adb-studio/logs/adb-studio.log` (limitado a 2 MB).
- **Auditoria:** `~/.config/com.wadb.adb-studio/audit.jsonl` (JSONL, 5.000 linhas) — é a fonte da aba Histórico → Reverter.
- **Modo demo no navegador** é o caminho mais rápido para iterar na UI sem Rust: `npm run dev`.
- Para testar sem aparelho real, a suíte de integração Rust usa um `fake-adb` (shell script) em `src-tauri/tests/integration.rs` — veja os testes de segurança (serial malicioso, injeção de argv) lá.

## Performance

- Alvo: 2 GB de RAM. Se o app pesar, use **Configurações → Modo de desempenho**:
  - `low`: menos animações, refresh 15 s, buffer logcat 3.000.
  - `ultra`: zero animações/sombras/backdrop-filter, sem auto-refresh, buffer 1.500.
- O frontend não coleta métricas contínuas; `scripts/measure-performance.sh` faz medições pontuais sob demanda.
