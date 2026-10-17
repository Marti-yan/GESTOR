# Informações para integrar o Atende Chat

Não é necessário transferir o projeto inteiro. Abra o Atende Chat com a outra IA e envie o pedido abaixo. Traga a resposta para o chat do GESTOR. Depois do levantamento, podemos pedir apenas dois ou três arquivos pequenos e específicos.

```text
Analise este projeto Atende Chat para explicar como reutilizar sua conexão WhatsApp em outro sistema Node.js/TypeScript com Electron.

Não altere o projeto. Não exiba credenciais, .env, QR codes, tokens, cookies, chaves de sessão, bancos de dados, conversas nem telefones reais. Use valores fictícios nos exemplos.

Entregue:

1. Tecnologia e versão: Baileys, whatsapp-web.js, Evolution API, Cloud API ou outra? Mostre as dependências e versões relevantes do package.json. A conexão roda dentro do backend ou em serviço separado?

2. Ciclo da conexão: criação, QR/pairing code, consulta de estado, reconexão, desconexão e logout. Onde e como persiste a autenticação? Existem várias lojas ou números? Não inclua o conteúdo das sessões.

3. Interface de integração: rotas HTTP, métodos, autenticação e exemplos de JSON fictícios. Eventos WebSocket/webhook para QR, conexão, mensagens de entrada/saída e confirmação de entrega. Como valida a autenticidade dos webhooks? Há OpenAPI/documentação?

4. Envio e recebimento: exemplo mínimo de envio de texto. Identificadores de contato, conversa e mensagem. Como diferencia cliente, operador e envio do próprio robô? Como evita duplicidade, trata falhas e envios sem confirmação? Como trata grupos, anexos e identificadores @lid, se existirem?

5. Tickets: como cria/fecha/reabre um ticket? Como pausa e retoma o robô quando um operador assume? Como implementa tags e respostas rápidas?

6. Requisitos: Node, banco, Redis, navegador/Chromium e outros serviços. O que precisa ficar sempre ligado? Podemos consumir a conexão existente por API sem abrir outra sessão? Qual é a licença e quais condições de reutilização existem?

Liste os caminhos dos arquivos relevantes e pequenos trechos das funções que definem essas interfaces. Não copie bibliotecas, arquivos compilados nem o projeto completo. Se a resposta ficar longa, divida em: A) transporte/autenticação/rotas/eventos, B) tickets/infraestrutura/licença. Priorize a parte A.
```

## O que trazer primeiro

- Nome e versão da biblioteca ou serviço WhatsApp.
- Trechos do `package.json` do backend referentes a essa conexão.
- Rotas/controladores de conectar, consultar estado e enviar texto.
- Função/evento que recebe mensagens, com os nomes dos campos.
- Forma de autenticar a API, sem informar a chave real.
- Licença do projeto e dependências.

Não envie `.env`, pastas de autenticação, QR, chaves, banco, números reais ou `node_modules`.

## Interface que o Pronto já prepara

O módulo novo possui contatos, tags, tickets, respostas rápidas e fila persistente de texto. Há adaptadores para Evolution API e Meta Cloud API. O levantamento servirá para confirmar compatibilidade ou implementar um adaptador específico para o transporte do Atende Chat, preservando a pausa do agente, a deduplicação e o histórico. Não foi possível verificar nem reutilizar o código do Atende Chat porque esse projeto não está montado neste ambiente.
