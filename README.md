<p align="center">
  <img src="docs/assets/zittodb-logo.svg" alt="Zittodb — Android Debug Bridge, direto e local" width="520" />
</p>

<p align="center">
  <a href="https://github.com/theeussx/wadb/releases"><img alt="Release" src="https://img.shields.io/badge/release-v0.1.0-3ddc84?style=flat-square&labelColor=0e1116" /></a>
  <a href="LICENSE"><img alt="Licença" src="https://img.shields.io/badge/license-MIT-2aa862?style=flat-square&labelColor=0e1116" /></a>
  <img alt="Plataforma" src="https://img.shields.io/badge/platform-Linux%20(amd64)-4da3ff?style=flat-square&labelColor=0e1116" />
  <img alt="Stack" src="https://img.shields.io/badge/Tauri%202%20%C2%B7%20Rust%20%C2%B7%20React-f5a623?style=flat-square&labelColor=0e1116" />
  <img alt="Privacidade" src="https://img.shields.io/badge/local--first%20%C2%B7%20sem%20telemetria-2aa862?style=flat-square&labelColor=0e1116" />
  <img alt="Tamanho do bundle" src="https://img.shields.io/badge/bundle-%3C100%20kB%20gzip-8a97a8?style=flat-square&labelColor=0e1116" />
</p>

<h3 align="center">Interface gráfica leve e local-first para <strong>ADB</strong>, <strong>scrcpy</strong> e <strong>fastboot</strong> no Linux.</h3>
<p align="center"><em>Android Debug Bridge, direto e local.</em></p>

<p align="center">
  Dispositivos, shell, screenshots, espelhamento de tela, aplicativos (com debloat e
  classificação de risco), arquivos, logcat, diagnóstico, auditoria e histórico —
  <strong>sem nuvem, sem conta e sem telemetria</strong>.
</p>

<p align="center">
  <!-- Placeholder: solte um GIF ou uma captura aqui -->
  <!-- <img src="docs/screenshot.png" alt="Interface do Zittodb" width="880" /> -->
  <em>feat: v0.1 · <a href="#roadmap">roadmap</a> · <a href="#documentação">documentação</a> · português (pt-BR)</em>
</p>

---

## Índice

1. [Identidade](#identidade)
2. [O que é](#o-que-é)
3. [Recursos](#recursos)
4. [Instalação](#instalação)
5. [Requisitos](#requisitos)
6. [Uso](#uso)
7. [Atalhos de teclado](#atalhos-de-teclado)
8. [Comandos e scripts](#comandos-e-scripts)
9. [Arquitetura](#arquitetura)
10. [Segurança](#segurança)
11. [Estrutura do projeto](#estrutura-do-projeto)
12. [Roadmap](#roadmap)
13. [Documentação](#documentação)
14. [Contribuindo](#contribuindo)
15. [Licença](#licença)

---

## Identidade

**Zittodb** é a marca do projeto: **Zitto** + **db**.

| Parte | Significado |
|---|---|
| **Zitto** | de *zitto* (it. "silêncio") e de *zit/zero* — leve, calado, sem ruído de fundo. |
| **db** | de **D**ebug **B**ridge. **Não é um banco de dados.** |

- **Pronúncia:** /ˈʒi.tɔ.db/ — “zí-toh-db”.
- **Wordmark:** `Zittodb` (Z maiúsculo, resto minúsculo). Sem “Studio”, sem “ADB” na frente.
- **Marca gráfica:** um **Z** com uma barra de cursor embaixo — o “Z” do nome e a
  homenagem ao prompt `>_` do terminal, já que o Zittodb é a GUI do ADB.
  Regenerável com `npm run icons` (ver [`scripts/generate-icons.mjs`](scripts/generate-icons.mjs)).
- **Paleta:** as cores do app, retiradas de [`src/styles/global.css`](src/styles/global.css).

  | Cor | Hex | Uso |
  |---|---|---|
  | Verde Zitto | `#3ddc84` | acento, marca, ação primária |
  | Grafite | `#0e1116` / `#10151c` | fundo do app e dos cartões |
  | Azul | `#4da3ff` | informação, rede |
  | Aviso | `#f5a623` | risco, atenção |
  | Perigo | `#ef5350` | operação destrutiva |

### Nomes técnicos

Toda a superfície do projeto segue a mesma marca — nada de nomes antigos:

| Onde | Valor |
|---|---|
| Nome exibido (UI, `.deb`, AppImage) | `Zittodb` |
| Pacote npm | `zittodb` |
| Crate Rust | `zittodb` (biblioteca `zittodb_lib`) |
| Identificador do app (Tauri) | `app.zittodb.desktop` |
| Configuração | `~/.config/app.zittodb.desktop/` |
| Dados / log | `~/.local/share/app.zittodb.desktop/`, `.../logs/zittodb.log` |
| Auditoria | `~/.config/app.zittodb.desktop/audit.jsonl` |
| Pastas de mídia padrão | `~/Pictures/Zittodb`, `~/Videos/Zittodb`, `~/Downloads/Zittodb` |
| Variável de ambiente (scripts) | `ZITTODB_PATH` |
| Eventos internos | `zittodb:*` (ex.: `zittodb:screenshot`) |
| Cabeçalho do serviço local (dev) | `X-Zittodb-Client: local` |
| Chave de settings no navegador | `zittodb-settings` |
| Tagline | *Android Debug Bridge, direto e local.* · *Android Debug Bridge, direct and local.* |

**Regra de nome:** *db* = **D**ebug **B**ridge. A interface inteira do produto é
"Zittodb"; "ADB", "scrcpy" e "fastboot" são as **ferramentas** que ele opera.

---

## O que é

O Zittodb é a camada de controle do Android para quem trabalha com `adb` no dia a dia:
o `adb` do sistema continua fazendo todo o trabalho — o Zittodb **constrói o argv, valida,
mostra o resultado e registra o que foi feito**, nunca um protocolo próprio.

- **Stack:** Tauri 2 + Rust (backend) · React + TypeScript + Vite (frontend) · CSS puro.
- **Filosofia:** o frontend **não executa processos**. O desktop usa Rust; o
  desenvolvimento no navegador usa um serviço Node integrado ao Vite para falar com o
  ADB local. Sem telemetria, nuvem ou contas.
- **Hardware-alvo:** laptops com 2 GB de RAM (modos de desempenho `low` e `ultra`).
- **Formato:** um AppImage e um `.deb` por release, sem electron, sem runtime embutido.
- **Licença:** MIT.

> **Estado: v0.1** — detecção de ferramentas, lista de dispositivos com estados,
> informações do aparelho, shell, screenshot, integração com scrcpy, instalação/extração
> de APK, testes e documentação. Veja o [roadmap](#roadmap).

### Fluxo mental em 10 segundos

```
Você clica  →  frontend envia uma operação tipada  →  Rust valida e monta argv
            →  adb/scrcpy/fastboot executa  →  saída volta como evento/JSON
            →  a ação vai para a auditoria (com "Reverter") quando faz sentido
```

---

## Recursos

| Área | O que faz |
|---|---|
| **Dispositivos** | Descoberta via `adb devices -l` (USB, Wi-Fi, emulador), estados `device/offline/unauthorized/recovery`, seleção por serial, conexão Wi-Fi (`adb connect`), desconexão. |
| **Informações** | getprop, bateria, armazenamento, rede, memória — sob demanda, sem coleta contínua. |
| **Tela** | scrcpy com presets (baixo 720p/30/2M · equilibrado 1080p/60/4M · alta nativa/120/8M), orientação, áudio, topmost, gravação MP4 (nunca sobrescreve). |
| **Aplicativos** | Lista via 1× `dumpsys package` + `pm list -3/-d`, abrir, ativar/desativar (usuário 0), limpar dados, desinstalar por usuário (reversível), extrair APK sem sobrescrever. |
| **Debloat** | Classificação de risco por heurística (nunca “seguro” só pelo nome), perfis conservador→avançado, lote com **uma** confirmação digitada, reversão pelo Histórico. |
| **Arquivos** | Navegação de `/sdcard`, push/pull com progresso real (pull) e indeterminado (push), mkdir/renomear/apagar com confirmação digitada. |
| **Shell** | Sessão persistente por dispositivo, sem comandos automáticos, alvo sempre `-s SERIAL`. |
| **Logs** | `logcat -v threadtime` com filtro `TAG:PRIORITY`, buffer limitado (padrão 5.000 linhas), salvar/copiar, sem auto-limpeza. |
| **Comandos** | Builder com pré-visualização exata do argv que será executado (allowlist Rust). |
| **Fastboot** | `devices`, `getvar`, reinícios; flash/erase/unlock/lock **com confirmação digitada** (`FLASHAR`/`APAGAR`). |
| **Histórico** | Auditoria JSONL (limite 5.000) com ação de **Reverter** (desativar→reativar, desinstalar→reinstalar) e últimos dispositivos vistos. |
| **Configurações** | Tema (claro/escuro/sistema), idioma (pt-BR/en-US), modos de desempenho, caminhos manuais de ferramentas, pastas de saída. |

### Onde cada coisa mora na interface

- **Barra lateral (5 seções):** Dispositivos · Comandos · Fastboot · Histórico · Configurações.
- **Dentro do dispositivo (8 abas):** Visão geral · Tela · Aplicativos · Arquivos ·
  Shell · Logs · Diagnóstico · Debloat.

---

## Instalação

**Usuário final:** baixe o `.AppImage` ou o `.deb` na página de
[Releases](https://github.com/theeussx/wadb/releases) — não é preciso compilar nada.

```bash
# AppImage
chmod +x ./*.AppImage && ./*.AppImage

# .deb (Debian/Ubuntu)
sudo apt install ./*.deb
```

Para compilar a partir do código, veja [Uso](#uso) e
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

---

## Requisitos

- **Linux** (Wayland ou X11; distros base Debian/Ubuntu — ver [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)).
- **`adb`** (platform-tools) — `sudo apt install adb`.
- **`scrcpy`** (opcional, para a aba Tela) — scrcpy **3.2+** é necessário para Android 15;
  prefira o [release oficial](https://github.com/Genymobile/scrcpy/releases), pois
  `apt install scrcpy` pode instalar a versão antiga 1.25.
  Se o release oficial for extraído em `~/Downloads` (ou instalado em `PATH`/`~/.local/bin`),
  o Zittodb tenta encontrá-lo automaticamente. Caso contrário, em **Configurações →
  Ferramentas → scrcpy**, selecione o arquivo executável `scrcpy` — não o `.tar.gz`.
- **`fastboot`** (opcional, para a aba Fastboot) — `sudo apt install fastboot`.
- Autorização ADB padrão (RSA): o app **nunca** burla a autorização; dispositivos
  `unauthorized` aparecem listados com o aviso para você aceitar a chave no aparelho.
- Para compilar: **Node 20.19+ ou 22.12+** e **Rust estável** (1.77+).

```bash
# conference rápida do ambiente (mesma ordem de descoberta do app)
make check-deps
```

---

## Uso

### 1 · Navegador com ADB real (Linux)

Requer Node 20.19+ ou 22.12+ e ADB no `PATH`. Não precisa de Rust nem de Tauri.

```bash
sudo apt install adb
npm ci
adb devices -l     # conecte por USB, ative a depuração USB e aceite a chave RSA
npm run dev        # abra http://localhost:1420 (ou a porta indicada no terminal)
```

**Disponível nesta etapa:** detectar ferramentas, listar dispositivos reais, consultar
informações/bateria/armazenamento, listar aplicativos, shell interativo, logcat com
busca/pausa e download do log. As configurações de interface ficam no navegador; caminhos
personalizados de ferramentas ainda não são usados pelo serviço local (ele usa o `PATH`).

**Ainda exigem o desktop:** transferências e gerenciamento de arquivos, ações sobre
aplicativos, screenshot, scrcpy, rede/diagnósticos avançados, debloat, auditoria e
fastboot. Essas chamadas retornam uma mensagem explícita — **não são simuladas**. O shell
executa comandos reais no Android selecionado: use com cuidado.

O serviço é integrado ao Vite e sobe junto com ele. A API só aceita requisições JSON da
própria origem `localhost`/loopback, com o cabeçalho `X-Zittodb-Client: local`; acessos
externos são recusados e sessões sem atividade expiram em ~1 minuto. Para conectar por
Wi-Fi nesta etapa, use `adb connect IP:PORTA` no terminal e atualize a lista.

Se aparecer `unauthorized`, desbloqueie o aparelho e aceite a autorização. Se
`adb devices -l` não listar o aparelho, confira cabo, modo USB e regras udev.

### 2 · Demonstração sem dispositivo

```bash
npm run dev:demo
```

Dados simulados + banner de demonstração: ideal para iterar na UI sem Rust e sem
aparelho. `npm run preview` também é somente demonstração — o serviço ADB não entra no
build estático.

### 3 · Aplicativo desktop

```bash
npm run tauri:dev     # desenvolvimento
npm run tauri:build   # gera AppImage + .deb em src-tauri/target/release/bundle/
```

### Testes

```bash
npm run check         # tsc --noEmit + build + vitest
npm test              # vitest (i18n, presets, mock bridge, diálogo de confirmação, serviço local)
make test-rust        # cargo test (parsers, allowlist, segurança, processos, integração fake-adb)
```

---

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl+Shift+D` | Dispositivos |
| `Ctrl+Shift+A` | Shell |
| `Ctrl+Shift+S` | Screenshot |
| `Ctrl+Shift+F` | Arquivos |
| `Ctrl+Shift+L` | Logs |

---

## Comandos e scripts

### npm

| Comando | O que faz |
|---|---|
| `npm run dev` | Frontend + API ADB local em `http://localhost:1420`. |
| `npm run dev:demo` | Demonstração no navegador, sem ADB. |
| `npm run build` | `tsc --noEmit` + build de produção. |
| `npm run preview` | Serve o build estático (sem serviço ADB). |
| `npm run tauri:dev` | App desktop completo (frontend + Rust). |
| `npm run tauri:build` | Bundle release: **AppImage** e **.deb**. |
| `npm test` | Vitest (frontend + testes do serviço local). |
| `npm run check` | Build + testes. |
| `npm run icons` | Regenera os ícones da marca a partir de `scripts/generate-icons.mjs`. |
| `npm run check:deps` | Verifica `adb`/`scrcpy`/`fastboot` e imprime as versões. |

### make

| Alvo | O que faz |
|---|---|
| `make help` | Lista todos os alvos. |
| `make install` | `npm install`. |
| `make dev` / `make dev-tauri` | Frontend no navegador / app desktop. |
| `make build` / `make bundle` | Build do frontend / AppImage + `.deb`. |
| `make test` | Frontend + Rust. |
| `make check` | `tsc --noEmit` + vitest + `cargo test` (o que estiver disponível). |
| `make check-deps` | `scripts/check-deps.sh`. |
| `make perf` | `scripts/measure-performance.sh` (medições pontuais, sem telemetria). |
| `make clean` | Limpa `dist/`. |

---

## Arquitetura

```
┌────────────────────────────────────────────────────────────┐
│ Frontend (React + TypeScript)                               │
│  views → store (zustand) → services/bridge.ts              │
│                     (única fronteira)                      │
└──────────────────────────┬─────────────────────────────────┘
                           │ invoke (operações tipadas) + eventos
┌──────────────────────────▼─────────────────────────────────┐
│ Backend (Rust, Tauri 2)                                    │
│  commands/* ──► adb/operations (allowlist) ──► processes/  │
│                 security/ (validação + risco)              │
│                 storage/ (settings, auditoria, histórico)  │
└──────────────────────────┬─────────────────────────────────┘
                           │ vetores argv (std::process)
              adb · scrcpy · fastboot (do sistema)
```

Quatro princípios, aplicados sem exceção:

1. **Leve primeiro** — sem Electron, sem ADB embutido: usamos as ferramentas do sistema.
2. **O backend é dono da execução** — o frontend manda *o quê* fazer, nunca *como*.
3. **Local-first/offline** — sem rede além da conversa com o aparelho.
4. **Nada de reimplementar o protocolo ADB** — quem fala ADB é o `adb`.

`src/services/bridge.ts` define a interface `Bridge` (56 métodos) com duas implementações:
`TauriBridge` (invoke) e `MockBridge` (demo/testes). Erros seguem um contrato único,
`AppError { code, details }`, com códigos como `NO_DEVICE`, `DEVICE_UNAUTHORIZED`,
`CONFIRMATION_REQUIRED`, `FILE_EXISTS`… Details em
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Segurança

> A UI é confiável o bastante para **exibir** dados, nunca para **executar** comandos.

1. **Nenhum shell no frontend.** Não existe plugin de shell no Tauri; o frontend só envia
   operações tipadas.
2. **Allowlist em Rust.** Toda operação é um variant de `DeviceOperation`/`FastbootOperation`
   que vira um vetor de argv validado — sem interpolação de strings, sem `sh -c`.
3. **Confirmações digitadas.** Operações destrutivas exigem digitar a palavra exata
   (`APAGAR`, `REMOVER`, `REINICIAR`, `FLASHAR`).
4. **Série explícita.** Toda operação usa `-s SERIAL` do dispositivo selecionado — nunca
   “qualquer dispositivo”.
5. **Sem processos órfãos.** Registro de processos com `SIGTERM` → 3 s → `SIGKILL`.
6. **Nada sai da máquina.** Sem telemetria, sem analytics, sem nuvem, sem banco de dados.

### Única conexão externa

Ao abrir o app desktop, o Zittodb consulta **apenas os metadados públicos** do último
release no GitHub e avisa quando há versão nova. Nenhum dado seu ou do aparelho é
enviado, e o download/instalação continuam sendo manuais.

Modelo de ameaças completo em [`docs/SECURITY.md`](docs/SECURITY.md).

---

## Estrutura do projeto

```
zittodb/
├── README.md                        # este arquivo
├── Makefile                         # atalhos de desenvolvimento (make help)
├── package.json                     # scripts npm, dependências e metadados
├── package-lock.json                # lockfile — use npm ci
├── tsconfig.json                    # TS estrito: strict, noUnusedLocals, noUnusedParameters
├── vite.config.ts                   # build, dev server (porta 1420) e plugin do backend local
├── index.html                       # shell HTML: título, meta, tema inicial
├── .gitignore
│
├── docs/
│   ├── ARCHITECTURE.md              # camadas, fluxo de uma operação, eventos, timeouts
│   ├── SECURITY.md                  # modelo de ameaças e controles
│   ├── DEVELOPMENT.md               # toolchain, builds, scripts, flatpak, debug
│   ├── CONTRIBUTING.md              # regras inegociáveis e checklist de PR
│   └── assets/
│       ├── zittodb-logo.svg         # lockup da marca (README)
│       └── zittodb-mark.svg         # só a marca
│
├── scripts/
│   ├── check-deps.sh                # adb/scrcpy/fastboot + versões (honra ZITTODB_PATH)
│   ├── generate-icons.mjs           # gera os ícones PNG do Tauri sem dependências
│   └── measure-performance.sh       # medições pontuais de tempo/memória
│
├── server/
│   └── local.ts                     # API ADB local do navegador (plugin do Vite, só dev)
│
├── src/                             # ── FRONTEND (React + TypeScript) ──
│   ├── main.tsx                     # bootstrap React
│   ├── App.tsx                      # monta o shell, orça o evento zittodb:screenshot
│   ├── app/
│   │   └── AppShell.tsx             # sidebar, topbar, roteamento interno, banner de update
│   ├── components/                  # primitivos de UI compartilhados
│   │   ├── ui.tsx                   # Button, Badge, Spinner, EmptyState, ProgressBar, formatação
│   │   ├── Modal.tsx                # diálogo base (foco, ESC, backdrop)
│   │   ├── ConfirmDialog.tsx        # confirmação digitada (palavra-chave obrigatória)
│   │   ├── Toasts.tsx               # notificações de sucesso/erro/info
│   │   └── UpdateBanner.tsx         # aviso de nova versão (metadados públicos)
│   ├── config/
│   │   └── app.ts                   # identidade da marca, defaults, presets scrcpy, atalhos
│   ├── features/                    # uma pasta por área da interface
│   │   ├── devices/
│   │   │   ├── DeviceList.tsx       # lista de dispositivos, Wi-Fi, estados
│   │   │   └── DeviceDashboard.tsx  # as 8 abas do dispositivo selecionado
│   │   ├── screen/ScreenPanel.tsx   # scrcpy: presets, flags, gravação
│   │   ├── apps/AppsView.tsx        # listar, abrir, ativar/desativar, extrair APK
│   │   ├── debloat/DebloatView.tsx  # perfis, risco, lote, reversão
│   │   ├── files/FilesView.tsx      # /sdcard, push/pull, mkdir, renomear, apagar
│   │   ├── shell/ShellView.tsx      # sessão de shell por dispositivo
│   │   ├── logs/LogsView.tsx        # logcat com filtro, pausa e download
│   │   ├── diagnostics/DiagnosticsView.tsx  # rede, armazenamento, bateria
│   │   ├── builder/CommandBuilder.tsx       # monta e pré-visualiza o argv
│   │   ├── fastboot/FastbootView.tsx        # devices, getvar, flash, erase, unlock
│   │   ├── history/HistoryView.tsx          # auditoria + Reverter
│   │   └── settings/SettingsView.tsx        # tema, idioma, perf, ferramentas, sobre
│   ├── hooks/
│   │   └── useShortcuts.ts          # atalhos globais de teclado
│   ├── i18n/
│   │   ├── index.ts                 # t(key, params) + detecção de idioma
│   │   ├── pt-BR.ts                 # dicionário pt-BR
│   │   └── en-US.ts                 # dicionário en-US (o teste falha se faltar chave)
│   ├── services/
│   │   ├── bridge.ts                # interface Bridge + TauriBridge + LocalBridge + getBridge()
│   │   ├── deviceService.ts         # helpers de busca compartilhados (refresh, toasts)
│   │   ├── mock.ts                  # MockBridge: demo no navegador e testes de UI
│   │   └── updateService.ts         # metadados de release no GitHub (nunca baixa nada)
│   ├── stores/
│   │   └── app.ts                   # store zustand mínimo: settings, dispositivos, UI
│   ├── styles/
│   │   └── global.css               # tema claro/escuro + modos de desempenho
│   └── types/
│       └── index.ts                 # tipos compartilhados e o contrato AppError
│
├── tests/                           # vitest (jsdom)
│   ├── setup.ts                     # matchers e globals
│   ├── i18n.test.ts                 # paridade pt-BR ↔ en-US
│   ├── mock-bridge.test.ts          # contrato completo do MockBridge
│   ├── presets.test.ts              # presets de scrcpy e defaults
│   ├── confirm-dialog.test.tsx      # confirmação digitada bloqueia sem a palavra
│   ├── logs-view.test.tsx           # renderização da aba de logs
│   ├── local-backend.test.ts        # origem, cabeçalho e allowlist do serviço local
│   └── update-service.test.ts       # comparação de versões
│
└── src-tauri/                       # ── BACKEND (Rust / Tauri 2) ──
    ├── Cargo.toml / Cargo.lock      # crate `zittodb` (lib `zittodb_lib`)
    ├── build.rs                     # hook de build do tauri-build
    ├── tauri.conf.json              # produto, janela, segurança e bundle (AppImage + .deb)
    ├── capabilities/default.json    # permissões do Tauri (core + diálogo nativo, sem shell)
    ├── icons/                       # ícones gerados por scripts/generate-icons.mjs
    ├── src/
    │   ├── main.rs                  # entry point (lógica toda na lib, para testar)
    │   ├── lib.rs                   # montagem do app: estado, plugins, ~56 comandos
    │   ├── error.rs                 # AppError / ErrorCode (contrato único de erro)
    │   ├── applog.rs                # log de arquivo com rotação simples (2 MB)
    │   ├── adb/
    │   │   ├── mod.rs
    │   │   ├── client.rs            # ToolManager: descoberta de adb/scrcpy/fastboot
    │   │   ├── operations.rs        # allowlist DeviceOperation → argv validado
    │   │   └── parse.rs             # parsers puros de getprop/dumpsys/devices
    │   ├── commands/                # a superfície exposta ao frontend (invoke)
    │   │   ├── mod.rs               # AppState
    │   │   ├── tools.rs             # detectar e validar caminhos das ferramentas
    │   │   ├── devices.rs           # listar, informações, bateria, rede, Wi-Fi, reboot
    │   │   ├── packages.rs          # listar, habilitar/desabilitar, instalar APK
    │   │   ├── files.rs             # listar, push/pull, mkdir, remover
    │   │   ├── media.rs             # screenshot e pastas padrão de mídia
    │   │   ├── shell.rs             # sessão de shell persistente
    │   │   ├── logs.rs              # stream de logcat
    │   │   ├── scrcpy.rs            # iniciar/parar espelhamento e gravação
    │   │   ├── fastboot.rs          # devices, getvar, flash, erase, unlock
    │   │   ├── operations.rs        # execute_operation (fluxo canônico + auditoria)
    │   │   └── settings.rs          # settings, app info, caminhos
    │   ├── devices/mod.rs           # Coordinator: lock por serial
    │   ├── fastboot/mod.rs          # allowlist FastbootOperation
    │   ├── processes/
    │   │   ├── mod.rs               # ProcessRegistry (sem órfãos), timeouts
    │   │   ├── shell.rs             # sessões de shell
    │   │   ├── logcat.rs            # sessões de logcat
    │   │   └── transfer.rs          # push/pull com progresso e cancelamento
    │   ├── scrcpy/mod.rs            # versão mínima, presets e opções
    │   ├── security/
    │   │   ├── mod.rs               # validadores (serial, path, pacote, partição)
    │   │   └── risk.rs              # heurística de risco do debloat
    │   └── storage/
    │       ├── mod.rs               # diretórios do app (app.zittodb.desktop)
    │       ├── settings.rs          # settings.json atômico
    │       ├── audit.rs             # audit.jsonl com undo
    │       └── history.rs           # últimos dispositivos vistos
    └── tests/
        └── integration.rs           # integração com fake-adb + testes de segurança
```

### Mapa das camadas

| Camada | Onde | Pode… | Não pode… |
|---|---|---|---|
| Interface | `src/features/*` | renderizar, coletar entrada do usuário | executar qualquer processo |
| Estado | `src/stores`, `src/services` | falar com o backend via `bridge.ts` | conhecer argv ou shell |
| Contrato | `src/types`, `src/services/bridge.ts` | descrever operações e erros | depender de Rust ou DOM |
| Backend | `src-tauri/src/commands` | validar, montar argv, orquestrar | confiar em strings vindas da UI |
| Execução | `src-tauri/src/processes` | rodar e matar processos do sistema | inventar protocolo ADB |

---

## Roadmap

- [x] **v0.1** — ferramentas, dispositivos, informações, shell, screenshot, scrcpy, APK, testes e docs
- [ ] **v0.2** — risco de debloat por fabricante (Samsung, Xiaomi, Google) e fastboot estendido
- [ ] **v0.3** — i18n adicional (es, fr, ja…)
- [ ] **v0.4** — Flatpak assinado, página de releases e documentação traduzida

---

## Documentação

| Documento | Quando abrir |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Camadas, fluxo de uma operação, tabela de argv, eventos, timeouts. |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Modelo de ameaças, confirmações, superfície de rede e limitações conhecidas. |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Setup do toolchain, scripts, flatpak, debug e performance. |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | Regras inegociáveis, convenções e checklist de PR. |

---

## Contribuindo

O projeto tem regras curtas e rígidas (detalhes em
[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)):

1. Nada de shell no frontend; nada de `sh -c` no Rust.
2. Toda operação nova é um variant de allowlist **com teste**.
3. Destrutivo = confirmação digitada.
4. `-s SERIAL` sempre; sem "opere no que estiver conectado".
5. Sem telemetria, sem dependência nova sem motivo forte.
6. Todo texto de UI nos **dois** idiomas (`pt-BR` e `en-US`).

```bash
npm ci
npm run tauri:dev    # itere
npm run check        # tsc + vitest
make test-rust       # cargo test
```

---

## Licença

**MIT** — ver [`LICENSE`](LICENSE).

Feito com [Tauri](https://tauri.app), [React](https://react.dev) e
[scrcpy](https://github.com/Genymobile/scrcpy) (por Genymobile, GPL — usado como
ferramenta externa, nunca embutido ou modificado).
