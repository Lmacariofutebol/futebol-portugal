# Classificações do Futebol Português — GitHub Pages

Site estático para consultar as classificações do futebol sénior masculino em Portugal, desde a Liga Portugal até aos campeonatos distritais/regionais.

## Custo

A configuração foi preparada para um **repositório público no GitHub Free** e publicação por **GitHub Pages + GitHub Actions**. Não requer servidor, domínio próprio, cartão de crédito ou serviço pago.

## Atualização diária

O ficheiro `.github/workflows/pages.yml` executa o atualizador todos os dias às **19:00 na timezone `Europe/Lisbon`**. O GitHub Actions suporta agendamento com timezone IANA, portanto a hora acompanha automaticamente o horário de verão/inverno português.

O mesmo workflow também pode ser iniciado manualmente em **Actions → Atualizar classificações e publicar → Run workflow**.

### Segurança dos dados

- O atualizador grava `data/standings.json` apenas quando obtém pelo menos uma classificação válida.
- Se uma recolha falhar depois de já existirem dados, o ficheiro anterior é preservado.
- O workflow faz commit apenas quando o JSON mudou.
- O site é publicado mesmo que a tentativa de atualização daquele dia falhe, usando os últimos dados guardados.

## Fonte

A fonte principal configurada é **zerozero.pt**, com um pedido conservador e sequencial por página e links para as páginas de origem.

**Situação atual (2 de outubro de 2026):** acessos automáticos diretos ao zerozero podem receber HTTP 403. Este projeto **não tenta contornar** bloqueios anti-bot. Se o fornecedor recusar automação, o workflow mantém os últimos dados válidos e regista a falha no log. Para uma atualização 100% garantida será necessário um feed/API autorizado ou outra fonte pública que permita acesso automatizado.

## Cobertura pretendida

- Liga Portugal Betclic
- Liga Portugal 2 Meu Super
- Liga 3 Placard
- Campeonato de Portugal
- Campeonatos seniores masculinos oficiais das 22 associações distritais/regionais:
  - AF Algarve
  - AF Angra Heroísmo
  - AF Aveiro
  - AF Beja
  - AF Braga
  - AF Bragança
  - AF Castelo Branco
  - AF Coimbra
  - AF Évora
  - AF Guarda
  - AF Horta
  - AF Leiria
  - AF Lisboa
  - AF Madeira
  - AF Ponta Delgada
  - AF Portalegre
  - AF Porto
  - AF Santarém
  - AF Setúbal
  - AF Viana do Castelo
  - AF Vila Real
  - AF Viseu

## Como publicar — sem plugin do ChatGPT

1. Em GitHub, criar um repositório **público** chamado `futebol-portugal`.
2. Descompactar este ZIP.
3. No repositório: **Add file → Upload files**.
4. Arrastar **todo o conteúdo que está dentro da pasta**, incluindo `.github`.
5. Fazer commit para a branch `main`.
6. Abrir **Settings → Pages**.
7. Em **Build and deployment → Source**, selecionar **GitHub Actions**.
8. Abrir **Actions** e acompanhar `Atualizar classificações e publicar`.
9. Depois do deploy, o endereço será normalmente:
   `https://SEU-UTILIZADOR.github.io/futebol-portugal/`

## Teste local do site estático

É possível construir a pasta `_site` com:

```bash
npm install
npm run build
```

Para tentar atualizar os dados manualmente:

```bash
npm run update
```

## Estrutura

- `public/` — HTML, CSS e JavaScript do site
- `data/standings.json` — última fotografia válida das classificações
- `scraper.mjs` — recolha e normalização dos dados
- `scripts/update.mjs` — atualização segura
- `build-site.mjs` — prepara o conteúdo estático para Pages
- `.github/workflows/pages.yml` — atualização diária + publicação
