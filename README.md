# Pronto Gestor 0.7.0 — teste local Windows

Já instalado: atualize em **Minha loja → Atualizações** ou feche pela bandeja e execute **Reparar-Pronto-0.7.0.exe**. O banco em APPDATA é preservado. Confira a versão e a impressão automática ao reabrir.

Instalação nova: extraia TODO o ZIP desta branch e execute **Instalar.cmd**. Ele une as três partes, verifica o SHA-256 e abre o instalador Windows x64. Node e servidor incluídos.

## Precific e Atende Chat

- Aba Precific carrega o site original https://precific.martinscoders.com/ com sessão persistente. Entre com sua conta atual: dados/configurações salvos na conta usam a hospedagem original. Atualizar site recarrega as mudanças publicadas sem novo instalador.
- Atende Chat por HTTP/Socket.IO: informe backend, entre com a conta e escolha a conexão existente. Importa tickets, recebe eventos, obtém QR quando necessário e envia pelo ticket original, mantendo Baileys no Atende Chat.
- Assumir atendimento pausa o bot original; ativar o agente do gestor usa a IA do Pronto. Outro operador/encerramento remoto pausa essa IA. Histórico inicial não recebe resposta automática.
- Fila vinculada à conexão impede despachar mensagens antigas por outro número. Resultado incerto exige conferência; não há repetição automática.

Guia: **INTEGRACAO-ATENDECHAT-PRECIFIC.md**. Não foram alterados serviços na Hostinger/VPS. Campanhas e mídia do Atende Chat permanecem no sistema original; detalhes e contratos no guia.

## Validação

78 testes passaram; TypeScript/Vite e build Windows concluídos. O processo principal e recursos foram verificados; 13 arquivos extraídos do atualizador conferidos por SHA-256. O servidor empacotado passou por login/sincronização/tomada/envio com Atende Chat HTTP simulado. Fluxos Electron com conteúdo simulado verificaram a aba Precific, sessão, recarga e isolamento.

A rede do ambiente bloqueou o domínio Precific: a conta real não foi usada. Backend Atende Chat real, Windows e Elgin física ainda precisam de homologação no computador da operação. Nenhuma mensagem real nem treinamento pago foi executado.

Fonte: https://github.com/Marti-yan/GESTOR/tree/codex/mvp-pronto-gestor . O ZIP de código não contém banco, credenciais, sessões ou dados dos testes. Inclua provider.key no backup consistente da pasta database se cadastrar chaves.

O catálogo Ecta LojaDosSonhos continua pendente do acesso/exportação dos dados: a etapa anterior recebeu HTTP 403. A importação/exportação JSON do Pronto está disponível; veja TRANSFERIR-CARDAPIO.md.
