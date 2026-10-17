# Atende Chat e Precific — 0.7.0

## Precific dentro do gestor

A aba **Precific** abre o próprio https://precific.martinscoders.com/ dentro do executável. Entre com a mesma conta que usa no navegador: os dados e configurações salvos na conta continuam no backend original da hospedagem. Não existe uma cópia do site ou do banco no instalador.

O login fica salvo no perfil do aplicativo. Navegador e gestor têm sessões separadas, por isso o primeiro acesso no gestor pode pedir login. O site controla normalmente a expiração da sessão. Para trocar de conta, use **Sair** no próprio Precific.

**Atualizar site** recarrega o endereço original. Atualizações publicadas no Precific aparecem ao carregar/recarregar a aba, sem novo instalador. Alterações de dados usam o mesmo backend; uma tela já aberta atualiza conforme o comportamento do Precific. Não há uma sincronização paralela nem garantia de push que o site não ofereça. Rascunhos/preferências que o site salve somente no navegador continuam específicos do dispositivo. Integrar o estoque do Precific ao consumo dos pedidos do gestor é uma etapa separada.

A aba usa WebContentsView com sessão persistente isolada, sem Node/preload/IPC da página remota, mantendo sandbox, isolamento de contexto e segurança web. Não remove CSP ou X-Frame-Options. O conteúdo fica oculto ao trocar de aba, sair do gestor ou abrir um modal do gestor. A versão web oferece o link para abrir o Precific no navegador.

Não foi necessário modificar site, banco, domínio ou hospedagem Hostinger. Credenciais não foram incluídas no código ou instalador. O domínio real foi bloqueado pela rede do ambiente de desenvolvimento; o login real não foi utilizado. A abertura nativa, persistência, atualização e isolamento foram verificados com conteúdo simulado.

## Configurar o Atende Chat

O adaptador consome a instalação existente por HTTP e Socket.IO. O Atende Chat continua proprietário da sessão Baileys; seus serviços PostgreSQL, Redis, backend e proxy continuam onde já funcionam. O Pronto não abre uma segunda sessão, não acessa os bancos diretamente e não copia as chaves da sessão.

1. Em **WhatsApp → Conexão WhatsApp**, selecione **Atende Chat · usar conexão existente**.
2. Informe o endereço base **do backend**, com HTTPS quando externo. O frontend do painel pode usar outro endereço.
3. Ative o processamento e salve.
4. Entre com e-mail/senha da conta Atende Chat. A senha serve somente ao login; o JWT é criptografado no servidor do Pronto e não é devolvido ao renderer.
5. Selecione o número existente e toque em **Sincronizar tickets agora**. A operação continua em segundo plano. A importação inicial mantém o agente pausado e não responde ao histórico.
6. Se o WhatsApp já estiver conectado, não precisa iniciar outra sessão nem ler QR. **Iniciar sessão e obter QR** chama o próprio backend Atende Chat quando isso for necessário. O QR é temporário, atualizado pelo evento de sessão e não é salvo em arquivo.

O backend e as credenciais reais do Atende Chat ainda precisam ser informados na tela do seu gestor e homologados. Não envie senhas pelo GitHub/chat.

## Contratos e sincronização

O contrato segue o levantamento recebido para Atende Chat 4.10.8/Baileys WSocket e Socket.IO 4:

- `POST /login`: `{email,password}` → `{token,user:{id,companyId,name}}`.
- Bearer JWT: `GET /whatsapp/`, `GET /whatsapp/:id`, `POST /whatsappsession/:id`.
- `GET /tickets?status=pending|open&pageNumber=N&showAll=true`, `GET /tickets/:id`, `PUT /tickets/:id`.
- `GET /messages/:ticketId?pageNumber=N` → `{messages,hasMore}`; `POST /messages/:ticketId` com `{body,isPrivate:"false"}` → resposta com `id` ou `message.id`.
- Socket.IO no namespace `/{companyId}`, `query.token = "Bearer JWT"`, eventos `company-{id}-whatsappSession`, `company-{id}-appMessage`, `company-{id}-ticket`; inscrições `joinTickets` e `joinChatBox`.

Empresa/usuário vêm do login. Só a conexão selecionada é importada. Grupos, notas privadas e LID sem telefone resolvido são ignorados pelo agente. Mídia fica sinalizada para atendimento humano. IDs numéricos ou opacos de mensagens são aceitos.

A reconciliação por REST roda aproximadamente a cada 15 segundos, além dos eventos. Consulta até dez páginas por estado de ticket e vinte páginas por histórico; buscas incrementais param ao chegar a mensagens conhecidas. Histórico completo continua no Atende Chat. Encerramentos/trocas de atendente fora do gestor são reconciliados. Token expirado exige novo login: o contrato de refresh dessa instalação ainda precisa ser confirmado.

## Humano e agente

**Assumir e pausar agente** e uma resposta manual assumem o ticket remoto com o usuário autenticado. Segundo o contrato informado, essa operação desativa `isBot` e `useIntegration` do robô original.

**Ativar agente do gestor** assume o ticket para a IA do Pronto, dependendo da configuração global. Não devolve ao fluxo original do Atende Chat. Para isso, use o painel original; não são alterados campos internos de FlowBuilder por adivinhação.

Outro atendente, encerramento ou reativação do bot original pausam a IA do Pronto e invalidam respostas atrasadas. Envios já em trânsito não podem ser recolhidos. Concluir o ticket no gestor também conclui o remoto. Tags/respostas rápidas locais continuam no Pronto; aplicar tags do Atende Chat automaticamente poderia disparar saudações/mídia e não é feito.

## Envio e campanhas

O envio preserva o ticket remoto existente. Uma conversa precisa ser sincronizada antes de responder; não se cria contato/ticket remoto sem um contrato confirmado.

`POST /api/messages/send` confirma somente entrada na fila no levantamento fornecido; não é usado. Campanhas desse provedor ficam no módulo original do Atende Chat. Campanhas locais continuam disponíveis nos adaptadores Evolution/Cloud API.

Há idempotência local, associação da fila à conexão e deduplicação de mensagens/ACKs. Trocar número/empresa/provedor não despacha mensagens antigas pelo novo número. Timeout, resposta sem ID ou interrupção exigem conferência; não há repetição automática. A idempotência local não altera as garantias do servidor remoto nem elimina um resultado incerto depois do envio.

**Desvincular este gestor** desconecta somente o cliente de integração, preservando o WhatsApp no Atende Chat.

## Validação

Testes automatizados cobrem autorização, empresa/conexão, deduplicação, envio/ACK antecipado, incerteza, pausa da IA, expiração, notas privadas, IDs opacos e encerramento remoto; incluem o isolamento e encerramento seguro da aba Precific. Fluxos no Electron foram exercitados com site/Atende Chat simulados. Nenhuma mensagem real, treinamento pago ou mudança na Hostinger/VPS foi feita. Windows/Elgin e provedores reais precisam de validação no equipamento.
