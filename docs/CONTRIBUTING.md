# Contribuindo

## Regras do projeto (do spec — inegociáveis)

1. **Nada de shell no frontend.** O frontend nunca monta strings de comando nem executa processos. Se a mudança "precisa" de `sh -c` no Rust para funcionar, redesigne a operação.
2. **Allowlist, não free-form.** Operações novas entram como variants de `DeviceOperation` (ou `FastbootOperation`) com `validate()` + `to_args()` + teste unitário. Sem exceções.
3. **Destrutivo = confirmação digitada.** Se a operação perde dados ou reinicia o aparelho, ela exige palavra digitada (`APAGAR`/`REMOVER`/`REINICIAR`/`FLASHAR`).
4. **Série explícita.** `-s SERIAL` sempre; sem "operar no dispositivo conectado" ambíguo.
5. **Sem telemetria.** Nada de analytics, crash reports ou atualizações automáticas. A checagem opcional de versão consulta somente metadados públicos do release no GitHub.
6. **i18n:** todo texto de UI vai para `src/i18n/pt-BR.ts` **e** `src/i18n/en-US.ts` (o teste `i18n.test.ts` falha se um idioma faltar chave).
7. **Leveza:** nenhum novo dependency de frontend sem motivo forte; o bundle alvo é ~90 kB gzip.
8. **Sem sobrescrever arquivos do usuário** (screenshot, gravação, pull, log salvo) — prefira sufixo ou erro `FILE_EXISTS`.

## Fluxo

1. Branch a partir de `main`: `feat/…` ou `fix/…`.
2. Mude + teste:
   - Rust: `cd src-tauri && cargo test`
   - Frontend: `npm test`
   - Types: `npx tsc --noEmit`
3. PR pequeno e focado; PRs de segurança (validação, confirmações, argv) separados e rotulados.
4. Se a mudança mexe em `commands/` ou `operations`, atualize a tabela de argv em `docs/ARCHITECTURE.md`.

## Convenções de código

**Rust**
- `AppError`/`ErrorCode` para falhas — nunca `panic!` em caminho de comando.
- Parsers puros (string in, struct out) com teste unitário — veja `adb/parse.rs`.
- Processos: sempre via `processes/` (registry + timeout + kill). Nada de `std::process::Command` espalhado.

**TypeScript**
- `strict` ligado; sem `any` fora do limite da bridge (`payload: unknown` castado no site).
- Componentes pequenos; estado global só no store zustand.
- Erros: `asAppError(e)` + `ErrorDialog`; toasts para sucesso/info.

**CSS**
- Um arquivo (`src/styles/global.css`); classes utilitárias existentes antes de criar novas.
- Novos efeitos visuais precisam ser anulados por `html[data-perf='low'/'ultra']` (teste nos dois modos).

## Checklist do PR

- [ ] `npm test` verde
- [ ] `cd src-tauri && cargo test` verde
- [ ] `npx tsc --noEmit` limpo
- [ ] Chaves i18n nos dois idiomas
- [ ] Op. destrutiva nova tem palavra de confirmação **e** teste
- [ ] Docs atualizadas (README se for feature visível; ARCHITECTURE se for argv/contrato)
- [ ] Nenhuma dependência nova (ou justificativa no PR)
