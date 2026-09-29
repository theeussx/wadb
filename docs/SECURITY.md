# Segurança

Modelo de ameaças e controles do ADB Studio. A premissa central: **a UI é confiável o suficiente para exibir dados, mas nunca é confiável para executar comandos**.

## 1. Execução de processos

| Ameaça | Controle |
|---|---|
| Injeção de comando via valores do usuário (serial, path, pacote…) | Cada valor passa por validação por regex em `security/` **antes** de virar argv; aspas só são colocadas no `describe()` para exibição, nunca interpretadas por shell. |
| `sh -c "…"` com string montada | **Não existe.** `std::process::Command` recebe um `Vec<String>`; não há flag `shell: true` em lugar nenhum do código. |
| Alvo errado do comando | Toda operação de dispositivo carrega `-s SERIAL`; serial é validado (`validate_serial`); quando há mais de um dispositivo e a serial não é explícita → `AMBIGUOUS_DEVICE` (o app nunca "chuta" o dispositivo). |
| Injeção via serial (`$(rm -rf ~)`) | `validate_serial` restringe o charset; o serial vem do parse de `adb devices -l`, e a operação exige o mesmo serial do parse. |
| Argumentos com `-` (opção de flag) | Validadores rejeitam tokens iniciando com `-` onde o valor é um caminho/pacote (ex.: `getvar -v` rejeitado, testado). |
| Processo órfão travando o aparelho | `ProcessRegistry` com `Drop`; `SIGTERM` → 3 s → `SIGKILL`; `on_exit` mata tudo; operações com timeout explícito por tipo. |

## 2. Autorização do ADB (RSA)

- O app **nunca** burla a autorização: não importa `adbkey` por conta própria, não usa `adb root`, não tenta `unauthorized` em loop.
- Dispositivo `unauthorized` é listado com estado e **dica** (aceite a caixinha no aparelho). Operações contra ele falham com `DEVICE_UNAUTHORIZED`.
- Se o aparelho exige root (`adb root`) para alguma ação, o app mostra a falha do comando — não tenta elevar privilégio.

## 3. Confirmações destrutivas

Operações destrutivas exigem **digitar a palavra exata** (maiúsculas, sem tolerância). Um clique nunca é suficiente; o botão fica desabilitado até o texto bater:

| Operação | Palavra |
|---|---|
| Apagar arquivo remoto | `APAGAR` |
| Limpar dados do pacote | `APAGAR` |
| Desinstalar (usuário 0) | `REMOVER` |
| Reboot (qualquer alvo) | `REINICIAR` |
| fastboot flash | `FLASHAR` |
| fastboot erase / unlock / lock | `APAGAR` |

Desativar pacote **não** é destrutiva (é reversível e o app oferece Reverter no Histórico) — segue a política de risco, não a de confirmação digitada. Lotes de debloat usam **uma única** confirmação para o conjunto. Instalar APK (`install -r`) também não exige palavra: é reversível via desinstalação por usuário e o caminho local é validado (`validate_local_path`).

## 4. Debloat e risco

- Risco é calculado por heurística (`security/risk.rs`): `com.android.providers.*` → **Crítico**; `com.miui.*`/`com.xiaomi.*` → **Baixo**; GMS/GSF → **Atenção**; pacotes de sistema genéricos → **Perigoso**; **desconhecido nunca é "Seguro"** (`UNKNOWN`).
- O app **nunca afirma que um pacote é seguro por nome** — a UI mostra o risco e deixa a decisão (e a reversibilidade) com o usuário.
- Perfis (conservador → avançado) só **incluem** pacotes até um teto de risco; o usuário marca/desmarca à vontade.

## 5. Arquivos e mídia

- **Screenshots** auto-nomeados `screenshot-YYYY-MM-DD-HHMMSS.png`; se o nome já existe, erro `FILE_EXISTS` e a UI pergunta — com `force`, usa sufixo `-1`..`-N`, nunca sobrescreve silenciosamente.
- **Gravação scrcpy**: `--record <caminho>` validado; se o arquivo existe, sufixo `-1`..`-99`.
- **Pull/push**: caminhos de dispositivo validados por `validate_device_path` (absolutos, sem `..`, sem bytes de controle); caminhos locais por `validate_local_path`; a UI parte de `/sdcard`.
- **Salvamento de logcat**: nome do arquivo validado (sem `/` embutido além da pasta de destino).

## 6. Superfície de rede e dados

- **Zero** de telemetria/analytics e nenhum update automático. Ao abrir o app, ele pode consultar somente os metadados públicos do último release no GitHub para avisar sobre uma nova versão; nenhum arquivo é baixado ou instalado.
- Sem servidor local, sem DB, sem arquivos temporários compartilhados.
- Persistência: `~/.config/com.wadb.adb-studio/settings.json` (atômica), `audit.jsonl` (5.000 linhas), histórico de dispositivos (metadados), log do app (2 MB). Nada de token, cookie ou segredo.

## 7. Tauri / webview

- Sem plugin de shell (não há como o frontend executar algo direto do sistema).
- Sem CSP restritiva no dev, porque o app não carrega script remoto nem usa `eval`; em produção a webview é local (`frontendDist`).
- `freezePrototype: true` (hardening do prototype do webview).
- Diálogo de arquivos usa `tauri-plugin-dialog` (native), não `<input type=file>` com upload.

## 8. Fastboot

- Flash/erase/unlock/lock só com confirmação digitada **e** partição/arquivo validados (charset de partição, caminho local).
- A UI avisa explicitamente que flash incorreto pode deixar o aparelho sem boot.

## Limitações conhecidas

- O `adb` do sistema continua sujeito a seus próprios bugs; o app não corrige o binário.
- O modelo de risco é heurística: **não** garante que um pacote classificado como "Baixo" seja inofensivo em todos os aparelhos.
- Em modo demo (navegador), nenhuma operação real é executada — é o mesmo contrato, com resultados simulados.

## Serviço de desenvolvimento no navegador

`npm run dev` inclui uma API Node no próprio Vite. Não é um serviço de produção.
O serviço exige Host loopback, Origin correspondente, POST JSON e cabeçalho
`X-Wadb-Client: local`; não habilita CORS. Isso bloqueia chamadas de sites externos
usuais e DNS rebinding, mas não protege contra código malicioso executado na própria
origem, extensões privilegiadas ou usuários/processos locais. Não exponha o Vite
por túnel nem use proxy que reescreva esses cabeçalhos.

Os comandos são selecionados por allowlist e executados por `execFile`/`spawn`,
sem shell no computador. Seriais e filtros de logcat são validados. O terminal é
uma exceção intencional: o usuário envia comandos arbitrários ao shell **Android**
selecionado, com os privilégios concedidos pelo ADB. A autorização RSA continua
obrigatória. Os logs ficam em memória limitada; o download usa o navegador, não
uma escrita arbitrária em caminhos do computador. Sessões inativas expiram.
O modo demo não registra essa API. Operações ainda não implementadas retornam
`UNSUPPORTED_LOCAL`, sem fallback para dados simulados.
