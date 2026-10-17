# Pronto Gestor 0.6.0 — teste local Windows

Atualize em **Minha loja → Atualizações** (0.3.0+) ou feche pela bandeja e execute **Reparar-Pronto-0.6.0.exe**. O banco em APPDATA é preservado. Confira a versão na barra de título e a impressão automática ao abrir.

Para instalar do zero, extraia o ZIP completo desta branch e execute **Instalar.cmd**. As três partes são unidas e o SHA-256 é conferido antes da instalação. Requer Windows x64; inclui Node e servidor. Nenhuma VPS foi alterada.

## Novidades

- Tickets com pausa/retomada do agente, tags e Kanban por etapa ou tag; respostas rápidas e contatos.
- Campanhas com opt-in, intervalo fixo e descadastro. Envio incerto exige conferência e não é repetido automaticamente.
- Adaptadores de texto Evolution API e Meta Cloud API. Exigem instância/conta, credenciais e homologação; o executável não instala uma Evolution própria.
- Agente OpenAI por API, cadastro da loja e RAG lexical com SQLite FTS5. Exemplos revisados, JSONL e fine-tuning opcional, pago e confirmado na tela. Nenhum treinamento real foi iniciado.
- PWA do entregador com PIN individual, pedidos atribuídos, coleta/entrega/ocorrência e ponto do cliente salvo pelo telefone.
- GPS opcional do motoboy e mapa com precisão/última captura, trajeto recente e opção de parar. No celular exige HTTPS; acesso externo fica para a etapa de infraestrutura. PWA em segundo plano pode parar de atualizar.

O código do **Atende Chat** não está neste ambiente. Para integrar sua conexão específica, copie **LEVANTAMENTO-ATENDECHAT.md** para a IA do outro projeto e traga a resposta; não precisa compactar o projeto inteiro. Não envie credenciais nem sessões.

Guias: **COMECAR-AQUI.md**, **WHATSAPP-IA-ENTREGADORES.md**, **IMPRESSAO.md**, **PROXIMOS-COMANDOS.md**.

## Validação

65 testes passaram. Pacote Windows verificado; 13 recursos extraídos do atualizador conferidos por SHA-256. O servidor empacotado iniciou e respondeu aos módulos novos. Interface Electron e PWA a 390 px conferidos; GPS/mapa e APIs externas simulados no teste. Ainda precisam de validação no equipamento: instalador Windows, impressão física Elgin, GPS real e conexão real WhatsApp/OpenAI.

Código: https://github.com/Marti-yan/GESTOR/tree/codex/mvp-pronto-gestor . O pacote não contém banco, credenciais nem dados de clientes. Inclua `provider.key` no backup da pasta database se cadastrar chaves no seu computador. Hashes em SHA256SUMS.txt.

O catálogo Ecta LojaDosSonhos continua pendente: o endereço público retornou HTTP 403 na etapa anterior. Nenhum catálogo inventado foi incluído como cópia. A importação/exportação JSON do Pronto está disponível; veja TRANSFERIR-CARDAPIO.md.
