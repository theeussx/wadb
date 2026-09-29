# Zittodb

**Interface gráfica leve e local-first para ADB, scrcpy e fastboot no Linux.**

> Zittodb **não é um banco de dados**: o "db" vem de *Android Debug Bridge*.

Gerenciamento de dispositivos, shell, screenshots, espelhamento de tela, gestão de aplicativos (incluindo debloat com classificação de risco), transferência de arquivos, logcat, diagnóstico, auditoria e histórico.

<!-- Adicione aqui um screenshot ou GIF da interface: ![Zittodb](docs/screenshot.png) -->

- **Stack:** Tauri 2 + Rust (backend) · React + TypeScript + Vite (frontend) · CSS puro
- **Filosofia:** o frontend não executa processos. O desktop usa Rust; o desenvolvimento no navegador usa um serviço Node integrado ao Vite para executar ADB localmente. Sem telemetria, nuvem ou contas.
- **Hardware-alvo:** laptops com 2 GB de RAM (modos de desempenho `low` e `ultra`).
- **Licença:** MIT

> **Estado atual: V0.1.** Detecção de ferramentas, lista de dispositivos com estados, informações do dispositivo, shell, screenshot, integração scrcpy, instalação/extração de APK, testes e documentação. Veja o [roadmap](#roadmap).

---

## Instalação

**Usuário final:** baixe o `.AppImage` ou o `.deb` na página de [Releases](https://github.com/theeussx/zittodb/releases), sem precisar compilar.

```bash
# AppImage
chmod +x Zittodb-*.AppImage && ./Zittodb-*.AppImage

# .deb (Debian/Ubuntu)
sudo apt install ./zittodb_*.deb
```

Para compilar a partir do código, veja [Uso](#uso).

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
- `scrcpy` (opcional para a aba Tela) — scrcpy **3.2+** é necessário para Android 15; prefira o [release oficial](https://github.com/Genymobile/scrcpy/releases), pois `apt install scrcpy` pode instalar a versão antiga 1.25.
- Se o release oficial for extraído em `~/Downloads` (ou instalado em `PATH`/`~/.local/bin`), o Zittodb tenta encontrá-lo automaticamente. Caso contrário, em **Configurações → Ferramentas → scrcpy**, selecione o arquivo executável `scrcpy` — não o arquivo `.tar.gz`.
- Autorização ADB padrão (RSA): o app **nunca** burla a autorização; dispositivos `unauthorized` mostram o aviso.

## Uso

### Navegador com ADB real (Linux)

Requer Node 20.19+ ou 22.12+ e ADB no `PATH`. Não precisa de Rust ou Tauri.

```bash
sudo apt install adb
npm ci
adb devices -l     # conecte por USB, ative depuração USB e aceite a chave RSA
npm run dev        # abra http://localhost:1420 (ou a porta indicada no terminal)
```

**Disponível nesta etapa:** detectar ferramentas, listar dispositivos reais, consultar informações/bateria/armazenamento, listar aplicativos, shell interativo, logcat com pesquisa/pausa e download do log. Configurações da interface ficam no navegador. Caminhos personalizados de ferramentas ainda não são usados pelo serviço local: ele usa o `PATH`.

**Ainda exigem o desktop:** transferências/gerenciamento de arquivos, ações sobre aplicativos, screenshot, scrcpy, rede/diagnósticos avançados, debloat, auditoria e fastboot. Essas chamadas retornam uma mensagem explícita; não são simuladas. O shell executa comandos reais no Android selecionado: use com cuidado.

O serviço é integrado ao Vite e inicia com o mesmo comando. A API só aceita requisições JSON da própria origem `localhost`/loopback, com cabeçalho específico. Não exponha o servidor por túnel/rede pública; o acesso remoto à API é recusado. Sessões sem atividade expiram após cerca de um minuto. Para conectar por Wi-Fi nesta etapa, use `adb connect IP:PORTA` no terminal e atualize a lista.

Se aparecer `unauthorized`, desbloqueie o aparelho e aceite a autorização. Se `adb devices -l` não listar o aparelho, confira cabo, modo USB e regras udev antes de abrir o app.

### Demonstração sem dispositivo

```bash
npm run dev:demo
```

Usa dados simulados e exibe o banner de demonstração. `npm run preview` também é somente demonstração; o serviço ADB não é incluído no build estático.

### Aplicativo desktop

```bash
npm run tauri:dev   # desenvolvimento
npm run tauri:build # gera AppImage + .deb em src-tauri/target/release/bundle/
```

### Testes

```bash
npm run check       # TypeScript + build + testes
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

### Única conexão externa

Ao abrir o aplicativo desktop, o Zittodb consulta **apenas os metadados públicos** do último release ou tag no GitHub e mostra um aviso quando há versão mais nova. Nenhum dado seu ou do dispositivo é enviado. O download e a instalação continuam sendo manuais.

## Roadmap

- [x] **V0.1** — ferramentas, dispositivos, informações, shell, screenshot, scrcpy, APK, testes e docs
- [ ] **V0.2** — perfil de risco por perfil, fastboot estendido
- [ ] **V0.3** — i18n adicional

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
