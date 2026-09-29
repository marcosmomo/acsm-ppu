# Persistência do ACSM Main

Este procedimento é exclusivo dos CPS simulados 1, 5 e 7. Os diretórios `services/cps-lai-01` e `node-red/lai`, equipamentos OPC-UA e qualquer broker LAI estão fora do escopo.

## Modelo e fluxo

`acsm-main-persistence` assina `cps1/#`, `cps5/#`, `cps7/#`, `acsm/#` e `acsm1/#` no broker já usado pelos simuladores. Mensagens `data` e todas as grandezas numéricas usadas no OEE vão para `telemetry_messages` e `telemetry_measurements` no MySQL. OEE, health, aprendizagem, raciocínio, previsão e inteligência local/sistêmica vão para `analytics_results` no MongoDB. Status, comandos, confirmações e erros vão para `operational_events`.

O MongoDB é a fonte principal da HCM. Antes de cada operação, as APIs hidratam o arquivo-espelho a partir das coleções MongoDB; após uma mutação, só retornam sucesso depois do commit no MongoDB. O arquivo JSON é mantido exclusivamente como espelho de compatibilidade/retorno. Durante sincronização incompleta, `hcm_meta.state=updating` faz as leituras retornarem indisponibilidade em vez de conteúdo parcialmente confirmado. As coleções normalizadas são sincronizadas por revisão; documentos obsoletos da revisão anterior são removidos apenas após o novo conjunto ser gravado.

Identidades explícitas (`messageId`, `eventId`, `commandId`) são preferidas. Na ausência delas é usado hash de tópico, instante de origem e conteúdo. Assim uma reentrega é idempotente, mas amostras iguais em instantes diferentes são preservadas.

## Isolamento ACSM Main / ACSM-PPU-LAI

O nome do tópico não é suficiente. Uma mensagem só é aceita quando contém `environmentId: acsm-main` ou `origin: acsm-main-simulation`. Resultados sistêmicos sem marcador explícito somente são aceitos quando sua composição identifica exclusivamente `CPS-001`, `CPS-005` e `CPS-007`. Mensagens com marcadores `cps-lai`, `ppu-lai`, `opcua`, `physical-equipment`, CPS fora da lista ou origem indeterminável são rejeitadas e contabilizadas em `/health`.

O cadastro de interface da aplicação ainda conhece `cpslai1`, portanto `acsm/#` e `acsm1/#` são recursos potencialmente compartilhados. O filtro de conteúdo acima é a fronteira efetiva de persistência. Os publicadores simulados adicionam `environmentId`, `origin` e `cpsId` sem remover campos existentes.

O ingresso em manutenção abre ou relaciona `maintenance_records`. Retorno à operação somente acrescenta `returned_to_operation` ao histórico: não fecha a intervenção nem presume reparo. Campos não informados permanecem nulos. Registros simulados recebem `origin: simulation`.

Solicitações, atualizações e encerramentos explícitos podem ser publicados em `acsm/maintenance` com `maintenanceId`, `cpsId`, `maintenanceState` e, quando conhecidos, `type`, `reason`, `description`, `responsible`, `result`, `episodeId` e `commandId`. Cada mudança é acrescentada a `history`; somente estados explícitos `closed`, `completed` ou `cancelled` definem `closedAt`.

## Execução

Copie `.env.example` para `.env`, substitua todos os segredos e garanta previamente a rede e os volumes externos dos CPS usados pelo Compose existente. Execute `docker compose config` e depois `docker compose up -d --build`. A saúde da persistência está em `http://localhost:3010/health`; históricos compatíveis com os painéis estão em `/api/history/level1` e `/api/history/level2`. Para a aplicação Next no host, defina `ACSM_PERSISTENCE_URL=http://localhost:3010`.

Não há TTL nem exclusão automática. A fila `/app/data/pending.jsonl` tenta novamente com backoff até 12 tentativas. Ao esgotar tentativas ou atingir 10.000 pendências, o registro é escrito em `/app/data/pending.jsonl.failed` com identidade, motivo e último erro; nada é descartado silenciosamente. `/health` informa `pending`, `failed`, `exhausted`, `queueFullFailures` e `full`. Para reprocessar até 100 falhas: `POST /api/pending/reprocess?limit=100`.

O histórico usado por `HistoryRecordsButton`, `CPSDashboard` e `CPSAnalyticsPanel` consulta `/api/history/level1` ou `/api/history/level2` na aplicação Next, que funciona como proxy para o MongoDB. O fluxo Node-RED JSON/JSONL permanece somente como legado para retorno e migração.

Os logs da fase Plug também usam o MongoDB como fonte principal. `GET` e `POST /api/plug-log`, a exportação JSON e o relatório PDF consultam `operational_events` com `eventType: plug_log`. A chave `messageId=plug:<id>` evita duplicidade entre reenvios. O filtro desta coleção é deliberadamente fixo em `cps1`, `cps5` e `cps7`; ele não herda `cpslai1` da configuração de interface. `data/plug-phase-log.json` permanece somente como legado de migração e retorno.

## Migração e retorno

Simule primeiro: `docker compose run --rm -v "${PWD}:/workspace:ro" -e ACSM_MAIN_ROOT=/workspace acsm-main-persistence npm run migrate -- --dry-run`. Aplique somente após revisar o relatório: use o mesmo comando com `--apply`. Upserts pelas chaves estáveis tornam a migração repetível. Os arquivos originais nunca são removidos. A HCM é migrada para coleções normalizadas; não é usado um documento monolítico, pois o conjunto legado pode exceder o limite BSON de 16 MB.

Para retornar à configuração anterior, pare apenas `acsm-main-persistence`, `acsm-main-mysql` e `acsm-main-mongodb` e remova `ACSM_PERSISTENCE_URL` da aplicação. Não use `down -v`: os volumes exclusivos preservam os dados. Os JSON legados continuam disponíveis e os CPS/broker permanecem inalterados.

## Consultas de verificação

MySQL: `SELECT cps_id, metric, value, source_time FROM telemetry_measurements ORDER BY source_time DESC LIMIT 20;`.

MongoDB: consulte `analytics_results`, `operational_events`, `maintenance_records`, `hcm_episodes`, `hcm_events`, `hcm_decisions`, `hcm_effectiveness` e `hcm_knowledge`. Os índices principais são CPS+período, escopo+CPS+período, manutenção por CPS+estado, episódios por alvo+estado e assinaturas únicas de conhecimento.

## Validação de ativação em 2026-09-23

Foram reconstruídos e recriados somente `acsm-cps1`, `acsm-cps5` e `acsm-cps7`, sem recriar broker ou bancos e sem remover volumes. Antes da recriação, `docker diff` não mostrou arquivos na camada gravável; depois dela, os três volumes externos continuaram montados em `/app/data`. Os estados permaneceram `lifecyclePhase=play`, `operationMode=stopped` e `playEnabled=false`.

Como os CPS estavam parados, uma observação MQTT passiva de oito segundos recebeu zero mensagens novas. Portanto a persistência contínua de dados produzidos pelos CPS não foi declarada validada: a ação pendente é um operador autorizado executar Play pela interface normal. Nenhum comando Play foi enviado durante a validação.

O teste injetado, separado da evidência de produção, publicou duas vezes a mesma amostra marcada de `CPS-005` e uma mensagem `CPS-LAI-001` com marcador genérico `acsm-main`. O serviço contabilizou duas entregas aceitas e uma rejeição `missing_or_lai_origin`; o MySQL conteve uma única linha da amostra (`TestValue=42`), confirmando a idempotência. A fila terminou com `pending=0`, `failed=0`, `exhausted=0` e `queueFullFailures=0`.

A migração foi validada primeiro em `acsm_main_documents_migration_test`: 10.134 registros compatíveis foram inseridos na primeira execução e zero na segunda. Quatro eventos de Plug fora dos CPS permitidos foram relatados e não importados. A aplicação posterior no banco principal inseriu 143 registros ainda ausentes. O teste do endpoint inseriu um evento identificado como teste e a segunda chamada com o mesmo ID foi deduplicada; uma chamada com `cpslai1` foi recusada. Os arquivos de origem não foram alterados nem removidos.

### Verificação observacional após a ativação pela interface

Uma nova verificação foi executada em 2026-09-23 somente por leitura. Não foram enviados comandos Play/Stop, mensagens MQTT de teste nem alterações de governança. A observação usou os estados HTTP dos CPS, assinatura MQTT passiva, consultas somente leitura no MySQL e MongoDB e as APIs de histórico. Todas as evidências desta seção correspondem a **dados produzidos pelos simuladores em execução**; não representam medições de equipamentos físicos.

O estado observado foi:

| CPS | Estado operacional | Resultado |
| --- | --- | --- |
| `CPS-001` | `lifecyclePhase=play`, `operationMode=running`, `playEnabled=true` | Persistência contínua validada |
| `CPS-005` | `lifecyclePhase=play`, `operationMode=stopped`, `playEnabled=false` | Não validado em operação; não produziu novos registros |
| `CPS-007` | `lifecyclePhase=play`, `operationMode=running`, `playEnabled=true` | Telemetria e analytics validados; ressalva de `sensordata` descrita abaixo |

A cadência configurada de telemetria e resultados locais é de um segundo. A observação efetiva cobriu aproximadamente 158 segundos para telemetria e 121 segundos para `analytics_results`, portanto não foi necessário ampliar a janela por causa da cadência cognitiva. Nesse período, as contagens evoluíram da seguinte forma:

| CPS | `telemetry_messages` inicial → final | Variação | `analytics_results` inicial → final | Variação |
| --- | ---: | ---: | ---: | ---: |
| `CPS-001` | 2.301 → 2.775 | +474 | 3.225 → 3.705 | +480 |
| `CPS-005` | 1 → 1 | 0 | 0 → 0 | 0 |
| `CPS-007` | 1.758 → 2.072 | +314 | 2.767 → 3.129 | +362 |

Uma segunda janela curta confirmou a continuidade: em 15 segundos, `CPS-001` passou de 3.177 para 3.224 mensagens MySQL (+47) e de 4.449 para 4.529 resultados MongoDB (+80); `CPS-007` passou de 2.340 para 2.372 (+32) e de 3.684 para 3.741 (+57). O `CPS-005` permaneceu sem crescimento.

Uma assinatura MQTT passiva de aproximadamente dez segundos observou 60 mensagens do `CPS-001` e 63 do `CPS-007`. Os payloads continham `environmentId: acsm-main`, `origin: acsm-main-simulation` e o `cpsId` permitido, portanto satisfizeram o filtro `explicit_acsm_main_marker`. Foram observados, sem publicação pelo verificador:

- `CPS-001`: `cps1/data`, `cps1/health`, `cps1/oee`, `cps1/status`, `acsm/cps1/oee` e `acsm/cps1/learning`;
- `CPS-007`: `cps7/data`, `cps7/sensordata`, `cps7/health`, `cps7/oee`, `cps7/status` e `acsm/cps7/learning`.

A correspondência exata de uma amostra foi confirmada entre MQTT e MySQL para `CPS-001`, tópico `cps1/data`, instante `2026-09-23T21:20:55.691Z` (`ts=1790198455691`). Os valores coincidiram no payload integral e em `telemetry_measurements`: `TempPontaSolda=208.2`, `CorrenteArco=64.9`, `PressaoGas=9.53`, `PieceCounter=443` e `CycleTimeMs=2050`.

As APIs retornaram registros novos e separaram os escopos configurados:

- `/api/history/level1` retornou `scope=cps_local` para `cps1/health`, `cps1/oee`, `cps7/health` e `cps7/oee`;
- `/api/history/level2` retornou `scope=acsm_system` para `acsm/cps1/learning`, `acsm/cps1/oee` e `acsm/cps7/learning`.

Os 200 registros mais recentes de `level2` ainda eram resultados atribuídos individualmente a `CPS-001` ou `CPS-007`. Não foi observado nesse recorte um resultado agregado entre múltiplos CPS em tópico como `acsm1/level2/intelligence`; portanto publicação no escopo ACSM foi confirmada, mas um novo resultado sistêmico agregado não foi confirmado.

A ausência de novos episódios HCM não é considerada falha nesta validação quando nenhum evento capaz de abrir ou atualizar um episódio tiver ocorrido durante a janela. A continuidade é avaliada pelos dados produzidos pelos simuladores em execução e pelos resultados efetivamente publicados; a validação de episódios HCM depende da ocorrência natural de um evento gerador de episódio.

MySQL e MongoDB estavam `healthy`, e a API de persistência estava `ready=true`. No ponto de controle após a auditoria havia 18.264 mensagens aceitas, `pending=0`, `failed=0`, `exhausted=0`, `queueFullFailures=0` e `full=false`. Não apareceram marcadores `[PENDING]` ou `[DEAD_LETTER]`. Houve um único `ECONNREFUSED` ao MySQL durante a inicialização às `2026-09-23T20:55:53Z`; o contêiner reiniciou uma vez, publicou `[READY]` às `20:56:01Z` e não apresentou erro de gravação durante a janela operacional.

### Lacuna corrigida e ativação pendente

A auditoria por tópico encontrou uma lacuna em `cps7/sensordata`: dez mensagens foram observadas na janela MQTT, mas apenas um documento histórico existia. O payload não tinha timestamp nem valores variáveis; por isso todas as publicações geravam o mesmo `messageId` e eram corretamente interpretadas como reentregas idempotentes.

O publicador do `CPS-007` foi corrigido para incluir `ts` da própria amostra em `sensordata`. A sintaxe foi validada, os seis testes da persistência passaram e a imagem `acsm-cps7:latest` foi reconstruída. O contêiner em execução não foi recriado, porque o reinício faria o simulador voltar parado e exigiria um novo Play pela interface. A imagem corrigida preserva os marcadores `origin`, `environmentId` e `cpsId`; nenhuma regra de isolamento, banco, volume ou dado existente foi alterado.

Pendências operacionais:

1. Um operador autorizado deve ativar o `CPS-005` pela interface e repetir a observação passiva para validar sua persistência contínua.
2. Em uma janela controlada, recriar somente `acsm-cps7` com a imagem já reconstruída, executar Play pela interface e confirmar crescimento individual de `cps7/sensordata` em `operational_events`.
3. Produzir naturalmente um novo resultado agregado entre múltiplos CPS e confirmar sua presença em `/api/history/level2`, sem injeção de mensagens de teste.
