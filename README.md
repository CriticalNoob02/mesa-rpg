# Mesa RPG

Mesa virtual de D&D 3.5 para jogar com os amigos. O mestre abre a mesa e manda o link; os jogadores entram com um apelido, sem conta.

Plano completo em `~/.claude/plans/continue-elegant-squirrel.md`. Entregue até agora:

- **Fase 1:** salas por link, socket com reconexão, chat, dados rolados no servidor e log.
- **Fase 2:** motor de regras 3.5, dados SRD importados, criador de personagem (wizard) e ficha completa.
- **Fase 3:** mapa tático (cenas, imagem enviada pelo mestre, grid calibrável, tokens, névoa, régua e contagem de movimento).
- **Fase 4:** combate (iniciativa, turnos com limite de movimento, ataques resolvidos no servidor, efeitos e condições com duração, ficha simples de NPC).
- **Fase 5:** ambientação (narração para ler em voz alta, imagem de ambiente, áudio em loop, handouts por destinatário).

## Estrutura

```
apps/server/        Express + Socket.IO + Prisma 7 (Postgres). Servidor autoritativo.
apps/web/           Next.js 16 (App Router) + Tailwind 4 + zustand.
packages/rules/     Motor de regras 3.5 em TS puro: dados, empilhamento de bônus, deriveCharacter, validação.
packages/srd/       Dados SRD 3.5 (OGL) em JSON + raças e condições escritas à mão.
packages/protocol/  Tipos e limites compartilhados entre web e server (REST + eventos).
```

## Rodar local

Requer Node 22 (`nvm use`) e um Postgres. Localmente usamos o `radar-db` (porta 5432) com o banco `mesa`.

```bash
npm install
cp apps/server/.env.example apps/server/.env    # ajuste DATABASE_URL
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate                               # aplica prisma/migrations
npm run dev:server                               # :4010
npm run dev:web                                  # :3010
```

## Checks

```bash
npm run lint:ci
npm run typecheck
npm test
npm run build
```

Para testar o `PrismaStore` contra um banco real:
`TEST_DATABASE_URL=postgresql://... npm test -w @mesa/server`.

## Como funciona

- **Identidade:** cada participante tem um token aleatório. O banco guarda só o sha256 do token. O token do mestre vai no link de mestre (`/gm/<token>`); o do jogador fica no localStorage. O handshake do socket envia o token e o servidor decide o papel.
- **Dados:** o cliente manda só a expressão (`1d20+5`, `4d6kh3`, `d%`). Quem rola é o servidor, com `crypto.randomInt`.
- **Rolagem oculta:** quando é do mestre, só o mestre vê. Quando é de um jogador, só o jogador e o mestre veem. O filtro vale tanto no envio ao vivo quanto no histórico.
- **Caixa da mesa:** texto comum vai como chat. `/r 1d20+5 ataque` rola (o que vier depois da expressão vira rótulo). `/gr` faz uma rolagem oculta.
- **Reconexão:** o Socket.IO reconecta sozinho. A cada conexão o servidor manda o snapshot completo (participantes, presença e as últimas 200 linhas do log).
- **Limites:** cada participante pode fazer até 8 ações em rajada, com reposição de 2 por segundo. Criar mesa e entrar por convite têm limite de 30 a cada 10 minutos por IP.

## Regras (fase 2)

- **`deriveCharacter(base, effects, srd)`** calcula tudo a partir das escolhas do jogador mais os efeitos ativos:
  - atributos;
  - PV;
  - CA total, de toque e surpreso;
  - BBA, ataques iterativos e agarrar;
  - ataques por arma (Acuidade, Foco/Especialização, proficiência, tamanho);
  - resistências, iniciativa, deslocamento (raça, armadura e carga) e carga;
  - perícias (sinergias, penalidade de armadura, talentos);
  - espaços de talento por tipo;
  - magias por dia com bônus de atributo, CD e domínios.

  O web e o server usam a mesma função.
- **Empilhamento de bônus:** bônus do mesmo tipo não somam (vale o maior). Esquiva, sem tipo e circunstância somam. Penalidades sempre somam. A ficha mostra a conta de cada valor ao clicar.
- **`validateCharacter`:** o server recusa fichas que quebram a regra. Ele confere:
  - point-buy de 25 pontos;
  - dado de vida;
  - tendência da classe;
  - pontos e máximo de perícia;
  - pré-requisitos e espaços de talento;
  - domínios;
  - magias conhecidas e preparadas por nível;
  - carga.

  Pré-requisitos que o motor não sabe avaliar viram aviso para o mestre.
- **Simplificações conhecidas:**
  - os pontos de perícia usam a Int atual;
  - uma perícia é de classe se for de qualquer classe do personagem;
  - bônus condicionais (contra venenos, contra gigantes…) ficam só no texto.
- **Atributos por rolagem:** o servidor rola 6× 4d6 descartando o menor e anuncia no log.

## Mapa (fase 3)

- **Cenas:** o mestre cria quantas quiser (até 50). A primeira vira a ativa. O mestre pode **olhar** uma cena sem mudar a dos jogadores e depois **ativar** para todos.
- **Imagem do mapa:** o mestre faz upload de PNG, JPEG, WebP ou GIF (até 15 MB) pela rota `POST /api/assets`. O corpo vai cru e o server lê o formato pelos bytes. Os arquivos ficam em `ASSETS_DIR/<campanha>/`. Só participantes da campanha baixam a imagem; o web busca com o token no header, nunca na URL. Imagem trocada ou cena apagada removem o arquivo quando ninguém mais usa.
- **Grid:** 1 quadrado = 1,5 m. O mestre calibra o tamanho do quadrado em px e o deslocamento da origem; colunas e linhas seguem a imagem. Mudar o grid zera a névoa, porque os índices das células mudam.
- **Tokens:** o mestre cria NPCs, que podem ficar ocultos, com tamanho de 1×1 a 4×4. O jogador põe e move só o token do próprio personagem, na cena ativa.
- **Névoa por célula:** o mestre pinta com pincel 1/3/5 ou revela/cobre tudo. O **server filtra por pessoa**: o jogador não recebe token oculto nem token sob névoa, exceto o próprio.
- **Movimento:** cada arraste custa pela regra 1-2-1 (`moveCost` em `@mesa/rules`), e a paridade das diagonais continua entre arrastes da mesma rodada. O token acumula os quadrados andados, e o mestre zera para todos ("nova rodada"). Ao selecionar ou arrastar, o mapa mostra o alcance que sobra em três faixas: ação de movimento, movimento dobrado e corrida (×4, ou ×3 com armadura ou carga pesada). Bloquear quem passa do limite no turno fica para a fase 4 (combate).
- **Régua:** fica só na tela de quem mede e mostra a distância em metros e quadrados, também pela regra 1-2-1.
- **Celular:** abas Mapa e Mesa; zoom pelos botões +/−.

## Combate (fase 4)

- **Iniciativa:** "Iniciar combate" rola 1d20 + iniciativa no servidor para cada token da cena. Personagens usam a ficha com os efeitos ativos; NPCs usam a própria ficha. Empate vai para quem tem o maior bônus e, persistindo, para sorteio. O mestre edita os valores, adiciona e tira combatentes, e a vez continua com quem estava jogando. O jogador não vê combatentes ocultos; quando é a vez de um deles, aparece "vez do mestre".
- **Turno:** o mestre ou o dono do combatente da vez passa o turno. No início de cada turno, o movimento do token zera.
- **Limite de movimento:** durante o combate, o jogador só move o próprio token na vez dele, até a corrida da rodada (×4, ou ×3 com armadura ou carga pesada; sem correr quando fatigado ou exausto). O mestre recebe o mesmo bloqueio e pode **forçar**.
- **Efeitos e condições:** só o mestre aplica, escolhendo entre 18 magias prontas (`BUFFS` em `@mesa/srd`), as 23 condições ou um efeito personalizado.
  - Em personagem, o efeito vale em todas as cenas; em NPC, fica no token.
  - A duração em rodadas desconta no início do turno de quem lançou, como manda o 3.5. Sem quem lançou, desconta a cada rodada nova. Fora de combate, o mestre usa "Passar uma rodada".
  - Efeito expirado sai e gera uma linha no log.
  - Ficha, painel e mapa recalculam tudo com os efeitos, e o empilhamento por tipo continua valendo.
- **Ataque:** pelo painel do token. O servidor usa os ataques da ficha (com efeitos) ou do NPC e a CA do alvo com efeitos.
  - 1 natural sempre erra e 20 natural sempre acerta.
  - Acerto na margem de ameaça pede confirmação; confirmado, o dano é rolado ×multiplicador. Dano mínimo 1.
  - O dano sai dos PV do alvo (opcional), e o log mostra a rolagem, a confirmação e o dano, mas não a CA do alvo.
- **Ficha de NPC:** PV, CA (total, toque e surpreso), iniciativa, resistências e até 10 ataques com dano e crítico. Só o mestre recebe esses números.

## Ambientação (fase 5)

- **Narração:** cada cena tem um texto para ler em voz alta e uma imagem de ambiente, que o mestre prepara na aba Cenas.
  - Até o mestre clicar em "Revelar narração", o servidor não manda texto nem imagem aos jogadores, e a imagem não pode ser baixada por eles.
  - Ao revelar, o cartão abre sozinho para todos e o log registra "O mestre narra: …". Depois pode ser reaberto pelo botão de livro no mapa.
  - O mestre vê uma prévia antes de revelar.
- **Áudio ambiente:** o mestre cola o link direto de um arquivo de áudio, como mp3 ou ogg (YouTube não funciona), e clica em tocar ou parar para todos. O áudio segue a **cena ativa**, mesmo quando o mestre está olhando outra.
  - Volume e silenciar ficam no navegador de cada jogador.
  - Se o navegador bloquear a reprodução automática, aparece "Ativar som".
  - Só são aceitos links `http(s)`.
- **Handouts:** texto e/ou imagem que o mestre mostra para jogadores específicos ou para todos.
  - Sem destinatário, o handout fica guardado só com o mestre.
  - O servidor entrega o handout e a imagem dele apenas a quem recebeu.
  - Quem recebe vê "Handouts (1 novo)" na aba. Mostrar a todos gera aviso no log público; mostrar a alguns registra só no log do mestre.
- **Imagens:** o jogador só baixa uma imagem se ela for mapa de cena, ambiente de narração já revelada ou handout mostrado a ele. Imagem que deixa de ser usada é apagada do disco.

## Deploy (fase 6)

O deploy segue o padrão do Forja na vpszinha: stack do Portainer na rede `shared-services`, Postgres `forja-db` e NPM da stack `infra`. Nenhum serviço publica porta no host.

- **Imagens:** `docker/server.Dockerfile` e `docker/web.Dockerfile`. O workflow `.github/workflows/cd.yaml` publica no GHCR a cada tag `vX.Y.Z`, gerando `ghcr.io/<dono>/mesa-rpg-server` e `ghcr.io/<dono>/mesa-rpg-web`. O CI (`ci.yaml`) roda lint, typecheck, testes e build.
- **Stack:** `deploy/docker-compose-mesa.yaml`.
  - `mesa-server`: na subida, roda `prisma migrate deploy` antes de abrir a porta. As imagens enviadas ficam no volume `mesa_assets`.
  - `mesa-web`: o front.
  - `mesa-proxy` (nginx): `/api` e `/socket.io` vão para o servidor, com WebSocket e 1 h de timeout ocioso. O resto vai para o front.
- **Variáveis da stack:**

  | Var | Exemplo |
  |---|---|
  | `MESA_REGISTRY` | `ghcr.io/<dono>` |
  | `MESA_VERSION` | `v0.1.0` (padrão `latest`) |
  | `MESA_DATABASE_URL` | `postgresql://mesa:<senha>@forja-db:5432/mesa` |
  | `MESA_ORIGIN` | `https://mesa.arcanemarket.com.br` |

- **Banco:** rodar uma vez `deploy/create-db.sql` no `forja-db`. Ele cria o usuário e o database `mesa`; as tabelas vêm das migrações.
- **NPM:** proxy host `mesa.arcanemarket.com.br` → `mesa-proxy:80`, com **Websockets Support** ligado e certificado Let's Encrypt.
- **Teste local da stack de produção** (Postgres descartável, proxy em `http://localhost:8088`):

  ```bash
  docker compose -p mesa-smoke -f deploy/docker-compose-mesa.yaml -f deploy/docker-compose.smoke.yaml \
    --env-file deploy/smoke.env up -d --build
  # ... e para derrubar: o mesmo comando com `down -v`
  ```

- **Backup:** o dump diário do `forja-db` já cobre o database `mesa`. As imagens ficam em `/var/lib/docker/volumes/mesa_mesa_assets/_data` e precisam ser copiadas junto.

## Dados SRD

Fonte: base SRD 3.5 do Andargor em SQLite (v1.3, OGL). Os JSON em `packages/srd/data` ficam no repositório. Para regenerar:

```bash
curl -LO https://www.andargor.com/files/srd35-db-SQLite-v1.3.zip && unzip srd35-db-SQLite-v1.3.zip
npm run import -w @mesa/srd -- ./dnd35.db
```

O que é importado: 11 classes base (tabelas 1–20), 110 talentos do Livro do Jogador, 84 perícias (com subtipos), 67 armas, 18 armaduras e escudos, 163 itens, 35 domínios e 617 magias.

A base não traz raças nem condições estruturadas; elas estão escritas à mão em `packages/srd/src`. Nomes de talentos, magias e itens ficam em inglês por enquanto. As magias (~800 KB) só carregam no web quando há conjurador. Licença em `packages/srd/OGL.txt`.
