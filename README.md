# ADB Studio

Ferramenta **Linux** leve e **local-first** para trabalhar com **ADB**, **scrcpy** e **fastboot** via interface gráfica: gerenciamento de dispositivos, shell, screenshots, espelhamento de tela, gestão de aplicativos (incluindo debloat com classificação de risco), transferência de arquivos, logcat, diagnóstico, auditoria e histórico.

- **Stack:** Tauri 2 + Rust (backend) · React + TypeScript + Vite (frontend) · CSS puro
- **Filosofia:** o backend Rust é a única coisa que executa processos; o frontend nunca toca shell. Nenhum dado sai da máquina: sem telemetria, nuvem, contas ou servidores locais.
- **Hardware-alvo:** laptops com 2 GB de RAM (modos de desempenho `low` e `ultra`).

> **V0.1 (este repositório):** detecção de ferramentas, lista de dispositivos com estados, informações do dispositivo, shell, screenshot, integração scrcpy, instalação/extração de APK, testes e documentação. V0.2/V0.3 estendem (perfil de risco por perfil, fastboot estendido, i18n adicional).

---

## Funcionalidades (V0.1)

| Área | O que faz |
|---|---|
| **Dispositivos** | Descoberta via `adb devices -l` (USB, Wi-Fi, emulador), estados `device/offline/unauthorized/recovery`, seleção por serial, conexão Wi-Fi (`adb connect`), desconexão. |
| **Informações** | getprop, bateria, armazenamento, rede, memória — sob demanda, sem coleta contínua. |
| **Tela** | scrcpy com presets (baixo 720p/30/2M · equilibrado 1080p/60/4M · alta nativa/120/8M), orientação, áudio, topmost, gravação MP4 (nunca sobrescreve). |
| **Aplicativos** | Lista via 1× `dumpsys package` + `pm list -3/-d`, abrir, ativar/desativar (usuário 0), limpar dados, desinstalar por usuário (reversível), extrair APK sem sobrescrever. |
| **Debloat** | Classificação de risco por heurística (nunca "seguro" por nome), perfis conservador→avançado, lote com **uma** confirmação digitada, reversão pelo Histórico. |
| **Arquivos** | Navegação de `/sdcard`, push/pull com progresso real (pull) e indeterminado (push), mkdir/renomear/apagar com confirmação digitada. |
| **Shell** | Sessão persistente por dispositivo, sem comandos automáticos, alvo sempre `-s SERIAL`. |
| **Logs** | `logcat -v threadtime` com filtro `TAG:PRIORITY`, buffer limitado (padrão 5.000 linhas), salvar/copiar, sem auto-limpeza. |
| **Comandos** | Builder com pré-visualização exata do argv que será executado (allowlist Rust). |
| **Fastboot** | `devices`, `getvar`, reinícios; flash/erase/unlock/lock **com confirmação digitada** (`FLASHAR`/`APAGAR`). |
| **Histórico** | Auditoria JSONL (limite 5.000) com ação de **Reverter** (desativar→reativar, desinstalar→reinstalar) e últimos dispositivos vistos. |
| **Configurações** | Tema (claro/escuro/sistema), idioma (pt-BR/en-US), modos de desempenho, caminhos manuais de ferramentas, pastas de saída. |

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl+Shift+D` | Dispositivos |
| `Ctrl+Shift+A` | Shell |
| `Ctrl+Shift+S` | Screenshot |
| `Ctrl+Shift+F` | Arquivos |
| `Ctrl+Shift+L` | Logs |

## Requisitos

- **Linux** (Wayland ou X11; distros base Debian/Ubuntu — ver `docs/DEVELOPMENT.md`)
- `adb` (platform-tools) — `sudo apt install adb`
- `scrcpy` (opcional para a aba Tela) — `sudo apt install scrcpy`
- Autorização ADB padrão (RSA): o app **nunca** burla a autorização; dispositivos `unauthorized` mostram o aviso.

## Uso

### Demo no navegador (sem Tauri)

```bash
npm install
npm run dev        # http://localhost:1420 — banner "Modo demonstração"
```

O modo demo usa o mesmo contrato do backend (MockBridge) com dispositivos simulados — útil para testar a UI sem aparelho.

### Aplicativo desktop

```bash
npm run tauri:dev   # desenvolvimento
npm run tauri:build # gera AppImage + .deb em src-tauri/target/release/bundle/
```

### Testes

```bash
npm test            # vitest (i18n, presets, mock bridge, diálogo de confirmação)
cd src-tauri && cargo test   # Rust (parsers, allowlist, segurança, processos, integração fake-adb)
```

## Segurança (resumo — detalhes em `docs/SECURITY.md`)

1. **Nenhum shell no frontend.** Não existe plugin de shell no Tauri; o frontend só envia operações tipadas.
2. **Allowlist em Rust.** Toda operação é um variant `DeviceOperation` que vira um vetor de argv validado — sem interpolação de strings, sem `sh -c`.
3. **Confirmações digitadas.** Operações destrutivas exigem digitar a palavra exata (`APAGAR`, `REMOVER`, `REINICIAR`, `FLASHAR`).
4. **Série explícita.** Toda operação de dispositivo usa `-s SERIAL` do dispositivo selecionado — nunca "qualquer dispositivo".
5. **Sem processos órfãos.** Registry de processos; SIGTERM → 3 s → SIGKILL; `on_exit` derruba tudo.
6. **Nada sai da máquina.** Sem telemetria, sem analytics, sem nuvem, sem servidores/DBs locais.

## Estrutura

```
├── src/                  # frontend React + TS
│   ├── app/              # shell da UI (sidebar, topbar)
│   ├── features/         # devices, apps, files, shell, logs, screen, debloat, builder, fastboot, history, settings
│   ├── services/         # bridge.ts (único contato com o backend), mock.ts (demo)
│   ├── stores/           # zustand (estado global mínimo)
│   ├── i18n/             # pt-BR.ts, en-US.ts
│   └── styles/           # global.css (temas + modos de desempenho)
├── src-tauri/src/        # backend Rust
│   ├── adb/              # client, allowlist de operações, parsers
│   ├── processes/        # registro de processos, shell, logcat, transfers
│   ├── security/         # validações + classificação de risco
│   ├── scrcpy/           # presets, registro de processo
│   ├── fastboot/         # operações + confirmações
│   ├── storage/          # settings (atômico), auditoria JSONL, histórico, log
│   └── commands/         # ~50 comandos expostos via invoke
└── docs/                 # ARCHITECTURE, SECURITY, CONTRIBUTING, DEVELOPMENT
```

## Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — camadas, fluxo de uma operação, eventos, timeouts.
- [`docs/SECURITY.md`](docs/SECURITY.md) — modelo de ameaças e controles.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — setup do toolchain, builds, scripts.
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — convenções e regras do projeto.

## Licença

MIT — ver `LICENSE`.
