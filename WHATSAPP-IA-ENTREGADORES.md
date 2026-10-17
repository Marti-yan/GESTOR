# Atendimento, IA e entregadores — 0.6.0

## O que já pode testar localmente

O gestor Windows continua sendo o servidor principal. Pedidos, catálogo, impressão, contatos, tickets, base de conhecimento e atribuições ficam no SQLite do computador. Nenhum serviço foi publicado na VPS nesta etapa.

1. Atualize para 0.6.0 e abra **Entregadores**. Cadastre um nome e PIN individual (6–12 números).
2. Lance um pedido de entrega, aceite-o se veio do cardápio e atribua-o ao motoboy nessa aba. O pedido precisa estar aceito ou pronto.
3. Abra o QR/link **PWA do entregador** no celular da mesma rede. Entre com nome e PIN. O motoboy vê suas entregas, itens, endereço, telefone e valor/troco.
4. Marque o pedido como pronto no gestor. No celular, confirme a retirada e depois a entrega. As ações são confirmadas pelo servidor; sem rede, os botões ficam desabilitados.
5. Na porta do cliente, use **Confirmar localização do cliente**. Pode usar GPS ou coordenadas manuais, com confirmação explícita. O ponto é associado ao telefone do pedido e reaparece em próximas entregas desse telefone. Esse ponto do cliente é separado do GPS de acompanhamento do motoboy.

## GPS e mapa

Depois de entrar, o entregador vê **Compartilhar minha localização**. O navegador só solicita a permissão depois que ele toca no botão. Pode interromper a qualquer momento. Usar **Sair** no PWA, redefinir seu PIN ou desativar seu acesso também encerra o compartilhamento no servidor.

- O celular envia posição enquanto o app está aberto, no máximo uma vez a cada 10 segundos. O gestor consulta a cada 10 segundos. Não é uma transmissão contínua garantida.
- O mapa mostra o nome, posição, precisão aproximada, última captura e trajeto recente (até duas horas/1.000 pontos). Uma posição com mais de 90 segundos fica sinalizada como antiga.
- Encerrar o compartilhamento revoga seu identificador. Pacotes atrasados não podem reativá-lo. Uma nova sessão substitui a anterior.
- Pontos de trajeto antigos são removidos em gravações/consultas; a posição expira após 24 horas sem atualização. Se o servidor estiver desligado, essa limpeza acontece quando voltar a ser utilizado.
- O painel de localização é exclusivo do gestor. Outros entregadores e clientes não recebem as posições.
- O mapa usa Leaflet/OpenStreetMap com atribuição. Precisa de internet para carregar os mapas e está sujeito à disponibilidade/política de uso dos tiles. Para escala maior, contrate um provedor de mapas apropriado.

**No celular, geolocalização e instalação PWA exigem HTTPS com certificado confiável.** O HTTP pelo IP da rede local serve para testar os pedidos e o acesso, mas não libera o GPS. `localhost` é uma exceção para desenvolvimento no próprio computador. Não foi configurado um endereço HTTPS público nesta entrega.

Se encerrar sem conexão ou fechar o navegador abruptamente, a loja pode continuar vendo o último ponto recebido, marcado como antigo após 90 segundos. Nenhuma nova posição é enviada depois que o compartilhamento para neste aparelho.

O navegador pode suspender o GPS quando a tela apaga ou o PWA fica em segundo plano. Mantenha-o aberto durante o teste. Rastreamento garantido em segundo plano exigirá aplicativo móvel com os recursos/permissões próprios do sistema operacional; o PWA não oferece essa garantia.

Fora do Wi-Fi da loja, o celular precisa alcançar o servidor por HTTPS. Isso fica para a etapa de VPS/proxy. Não abra simplesmente a porta do banco ou publique o serviço HTTP local no roteador.

## WhatsApp: escolher o transporte

Em **WhatsApp → Conexão WhatsApp**, selecione um adaptador:

### Evolution API

Requer uma instância Evolution já existente e compatível. Informe origem/base URL, instância e chave; ao trocar de servidor, informe a chave novamente. O Pronto consulta QR/pairing code e estado, e envia textos pela API.

Rotas esperadas no provedor:

- `GET /instance/connect/{instance}`: `code`, `base64`, `pairingCode` e/ou estado.
- `GET /instance/connectionState/{instance}`: estado da instância.
- `POST /message/sendText/{instance}`: `{number, text}`; confirmação em `key.id`.

Não há instalação, provisionamento nem migração automática da Evolution no executável. O Pronto não abre uma sessão Baileys própria. Configure o webhook na instância existente, conforme sua versão, para `messages.upsert`:

- Destino: `https://SEU-ENDERECO/api/integrations/whatsapp`.
- Gere o token no gestor e configure o cabeçalho `x-pronto-hook: SEU_TOKEN` no serviço que encaminha os eventos.
- O corpo deve identificar a `instance` configurada; o evento contém `data.key.id`, `remoteJid` (ou `remoteJidAlt` de telefone), `fromMe`, `pushName` e `message.conversation` ou `extendedTextMessage.text`.
- Grupos são ignorados. Identificadores `@lid` sem um telefone alternativo não são convertidos por adivinhação.

Algumas versões diferem nesses contratos; precisam ser conferidas com a documentação/código da instância. Um provedor na mesma rede pode usar HTTP privado; no acesso externo, use HTTPS.

### Meta WhatsApp Cloud API

Requer conta/aplicativo/número habilitados na Meta, token com permissões adequadas, Phone Number ID, versão Graph API e App Secret. O estado “configured” indica presença de configuração, não homologação do número. A versão inicial é editável.

- Callback GET/POST: `https://SEU-ENDERECO/api/integrations/whatsapp`.
- Verify Token: token gerado no gestor.
- POST validado com HMAC SHA-256 do corpo original (`X-Hub-Signature-256`) e App Secret; somente o Phone Number ID configurado é processado.
- Respostas de texto usam a janela de 24 horas desde a última mensagem recebida no ticket. O provedor pode rejeitar por outros critérios, que aparecem como falha.
- Campanhas usam nome/idioma de template previamente aprovado pela Meta. Pode enviar o nome como único parâmetro `{{1}}` do corpo. Cadastre um template compatível, inclusive com orientação de descadastro. O Pronto não aprova nem consulta o catálogo de aprovação dos templates.
- A prévia textual da campanha é informativa; na Cloud API, o conteúdo entregue é o template aprovado no provedor.

Configure contas, credenciais, URLs públicas e webhooks antes de usar números reais. Não compartilhe chaves pelo chat nem as publique no GitHub.

### Atende Chat

Adaptador implementado na 0.7.0 a partir do levantamento recebido. Mantém a sessão Baileys original no Atende Chat. Configuração e limites em [INTEGRACAO-ATENDECHAT-PRECIFIC.md](INTEGRACAO-ATENDECHAT-PRECIFIC.md).

## Tickets, tags e respostas rápidas

- Um ticket ativo por contato; novas mensagens reutilizam esse ticket. Depois de concluído, uma nova mensagem abre outro.
- Kanban por etapa (aguardando/em atendimento/concluído) ou tag; busca e filtros. Uma conversa pode aparecer em várias colunas de tags.
- Tags possuem nome/cor; respostas rápidas têm título, atalho e texto. Escolha a resposta ou use `/atalho` no compositor.
- **Assumir e pausar agente** interrompe novas respostas automáticas. Responder manualmente também pausa o ticket. **Retomar agente** vale para as próximas mensagens, desde que a automação global esteja habilitada.
- Resposta da IA gerada durante uma intervenção humana é descartada. Envio já entregue ao provedor pode não ser recolhido; a pausa não cancela mensagens que já estão em trânsito.
- Mensagens de mídia são sinalizadas para atendimento humano; transcrição, envio de anexos e reprodução de áudio ficam para a próxima etapa.
- Este módulo orienta o cliente ao cardápio. Ainda não cria pedidos automaticamente a partir da conversa nem vincula automaticamente tickets a pedidos.

## Contatos e campanhas

Cadastre telefone com DDI/DDD, nome e origem do consentimento. Contato recebido no webhook não ganha autorização de campanha automaticamente.

- Campanha de 1–200 contatos autorizados, com seleção e filtro por tag. Os destinatários são registrados ao criar o rascunho.
- Intervalo fixo de 30–3.600 segundos, fila persistente e pausa/cancelamento. Não há randomizador para tentar escapar de bloqueios nem promessa de impedir bloqueios.
- Antes do envio, o opt-in é conferido novamente. Responder `SAIR`, `PARAR`, `PARE`, `STOP`, `CANCELAR` ou `DESCADASTRAR` desativa campanhas futuras e cancela mensagens pendentes desse tipo.
- Falha ou interrupção pode produzir **Conferir envio**. Não é reenviado automaticamente. Confira o telefone/provedor e marque como enviado ou cancelado.
- A fila só anda com servidor ligado, internet e provedor configurado. Retomada de campanha não reenvia automaticamente destinatários com falha/incerteza.

## Agente de IA: API + RAG local

Em **Agente de IA**, preencha horários, endereço, regiões/regras, pagamentos e encaminhamento humano. Cadastre perguntas/respostas principais. Catálogo disponível, preços e dados atuais da loja também são incluídos no contexto.

A recuperação usa **SQLite FTS5**, busca lexical com acentos normalizados, até cinco fontes por pergunta. Não usa embeddings nem banco vetorial nesta versão. É leve e funciona para uma base pequena de FAQs; sinônimos muito diferentes podem exigir palavras-chave adicionais. Uma futura etapa pode avaliar busca semântica.

Cadastre uma chave OpenAI no servidor e um modelo compatível com Chat Completions/JSON. Os padrões editáveis são `gpt-4.1-mini` para atendimento e `gpt-4o-mini-2024-07-18` para treinamento; disponibilidade e custos dependem da conta/provedor. Habilite o agente e, se desejar, a automação global. Use a prévia antes de liberar respostas automáticas.

O contexto enviado contém a pergunta, últimas mensagens do ticket e os dados selecionados da loja. `store:false` é enviado na chamada; isso não substitui a análise das políticas de retenção e da conta no provedor. Não existe modelo local nem necessidade de GPU. Sem chave, saldo ou internet, o atendimento humano continua disponível.

O limite diário conta tentativas de chamada, incluindo prévias e falhas, no fuso de São Paulo. É um limite de quantidade, **não um teto financeiro**. Configure também limites e alertas de custo na conta do provedor.

A IA não executa pagamentos, não confirma pedidos nem altera estoque. Sem fatos suficientes deve encaminhar à equipe. Pedido explícito de atendente e mensagens não textuais pausam a automação no servidor. Respostas de IA ainda precisam ser avaliadas em perguntas reais da loja.

## Fine-tuning e aprendizado

A base de conhecimento é atualizada sem retreinar. Fine-tuning serve para ajustar estilo e comportamento; não é o cadastro de preços, estoque ou horários.

1. Cadastre exemplos de pergunta/resposta ideal, revise e aprove. Não se treina automaticamente com todas as conversas.
2. Telefones/e-mails/documentos recebem mascaramento básico. Revise nomes, endereços e qualquer outro dado identificável antes de aprovar.
3. Exporte JSONL dos exemplos aprovados. São necessários pelo menos 10; 50–100 exemplos variados são uma base inicial mais útil.
4. Escolha um modelo compatível e confirme o custo na tela. Só essa ação envia o dataset e solicita um treinamento pago na sua conta.
5. Atualize o estado e ative o modelo treinado somente após sucesso. A ativação é explícita; o RAG continua ativo.
6. Trabalho em andamento ou sem confirmação bloqueia outro treinamento. Se a resposta se perder, confira o painel: vincule o ID `ftjob-...` ou confirme que nenhum trabalho foi criado. Não inicie novamente sem conferir.

Nenhum treinamento pago nem chamada real à OpenAI foi executado nesta entrega. O fluxo foi testado com provedor simulado. Ainda é necessário medir qualidade com conjunto separado de avaliação e comparar com o modelo base.

## Dados, testes e requisitos

O novo módulo usa o mesmo SQLite e servidor incluídos no executável; não adiciona Redis, Docker, GPU ou um segundo servidor obrigatório para o modo local. O serviço externo WhatsApp, quando escolhido, tem seus próprios requisitos.

Chaves de provedores ficam criptografadas em `provider_secrets`, usando `provider.key` na mesma pasta do banco. O backup consistente deve incluir a pasta `database` completa com o aplicativo encerrado; perder a chave impede recuperar os segredos antigos. O código/instalador publicado não leva esse diretório nem os dados dos testes.

Validação: testes automatizados de autorização, concorrência, GPS, tickets, webhook, pausa do agente, outbox, campanhas, RAG e treinamento com provedores simulados; compilação TypeScript/Vite e interface Electron/PWA em viewport móvel. No teste visual, GPS e imagens de mapa foram simulados. A conexão real WhatsApp/OpenAI, GPS em um aparelho físico e impressão Elgin no Windows ainda exigem teste na operação.

Referências de API: [OpenAI fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning), [criar treinamento](https://developers.openai.com/api/reference/resources/fine_tuning/subresources/jobs/methods/create), [geolocalização web](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API), [política dos tiles OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).
