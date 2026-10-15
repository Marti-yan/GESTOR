# Próximos comandos — executar um por vez

Estes são pedidos prontos para as próximas etapas de desenvolvimento. O MVP atual já cobre cardápio → gestor → impressão. Cada etapa deve preservar esse fluxo e acrescentar testes apropriados.

## 1. Validar a Elgin i8 na operação real

> Ajuste o perfil da Elgin i8 USB de 80 mm com base no teste físico: margens, tamanho da fonte, altura da página, acentos, corte e comportamento com falta de papel. Preserve o envio silencioso e registre os modelos/versões de driver homologados.

Aceite: pedido curto e longo legíveis, sem corte de texto; falha visível; reimpressão identificada. Depende da impressora física.

## 2. Publicar para clientes fora da loja

> Prepare o Pronto para produção na minha hospedagem Hostinger Business. Confirme recursos do plano, implemente persistência MySQL ou PostgreSQL gerenciado, migre o repositório SQLite, configure HTTPS, variáveis de ambiente, backup e monitoramento. Conecte o gestor Windows ao servidor publicado. Não altere dados ou compre serviços sem a autorização correspondente.

Aceite: cliente em outra rede faz pedido, gestor recebe e Elgin imprime; dados sobrevivem a novo deploy e reinício. A migração deve preservar pedidos e evitar reaplicar comandas antigas.

## 3. Melhorar segurança e administração

> Adicione recuperação e troca de senha, revogação de dispositivos, usuários por função, auditoria de operações e backup/restauração verificável. Preserve o acesso público apenas ao cardápio e aos links de acompanhamento.

Aceite: revogação impede acesso do dispositivo e restauração recupera pedidos sem imprimir novamente.

## 4. Adicionais, variantes e combos

> Adicione grupos de complementos com mínimos/máximos, tamanhos, variantes, combos e regras de preço. Faça o servidor validar as escolhas e distribua os componentes de combos para os setores corretos de impressão.

Aceite: total correto no cardápio, gestor e comanda; opção inválida não cria pedido.

## 5. Endereços com localização confirmada

> Adicione mapa ao checkout, pino ajustável, múltiplos endereços por cliente, referências e histórico de confirmação do ponto de entrega. Preserve um snapshot do endereço em cada pedido e proteja a recuperação dos dados do cliente.

Aceite: corrigir o endereço do cadastro não modifica pedidos anteriores.

## 6. Portal dos entregadores

> Crie um portal PWA de entregadores com login individual, pedidos atribuídos, aceite, coleta, conclusão e ocorrências. Permita confirmar ou propor correção da localização. Mostre apenas dados necessários às entregas autorizadas.

Aceite: dois entregadores não assumem a mesma atribuição e ações sem sinal são reconciliadas.

## 7. Pix confirmado pelo provedor

> Integre Pix com QR Code dinâmico, expiração e confirmação por webhook validado. Separe estado de pagamento e pedido, use idempotência e trate notificações repetidas, atrasadas, pagamento após expiração e estorno.

Aceite: imagem de comprovante não marca pedido como pago; evento repetido não duplica pagamento ou impressão.

## 8. Integração oficial iFood

> Implemente o adaptador oficial do iFood com os módulos autorizados para meu aplicativo: autenticação, autorização de loja, entrada de eventos, deduplicação, confirmação, preparo, cancelamento e reconciliação. Prepare os cenários de homologação antes de ativar pedidos reais.

Aceite: mesmo pedido externo aparece uma vez e eventos fora de ordem não reabrem pedido cancelado.

## 9. Integração oficial 99Food

> Implemente a 99Food a partir da documentação e das credenciais oficiais liberadas. Mantenha identificadores e estados originais no adaptador, faça testes de aceitação e integre os pedidos ao mesmo núcleo de produção e impressão.

Aceite: fluxo homologado com registros e tratamento de falhas; não presumir equivalência com o iFood.

## 10. WhatsApp oficial e mensagens prontas

> Adicione WhatsApp Cloud API com onboarding autorizado, caixa de entrada, transferência humana, respostas rápidas e templates. Respeite janela de atendimento e consentimento. Ligue mensagens e conversas aos pedidos existentes sem duplicá-los.

Aceite: operador assume conversa e impede resposta simultânea da automação.

## 11. IA com conhecimento e ferramentas

> Adicione uma IA de atendimento com conhecimento versionado por loja, RAG e ferramentas restritas para consultar catálogo, calcular carrinho e criar rascunhos. Preço, frete, estoque e pagamento devem ser validados pelo backend. Crie avaliações antes de liberar confirmações automáticas.

Aceite: cliente confirma o resumo; produto inexistente não entra no pedido; falha da IA permite atendimento humano.

## 12. Fine-tuning, apenas se houver ganho comprovado

> Avalie se fine-tuning melhora os erros medidos da IA. Compare com prompt/RAG, valide a disponibilidade atual dos fornecedores e as licenças dos modelos. Use dados com direitos adequados, separação por restaurante, treino/teste independentes e opção de reverter o modelo.

Aceite: ganho mensurável sobre a base, sem mistura indevida de conversas entre empresas.

## 13. Estoque, caixa e relatórios

> Acrescente caixa com abertura/fechamento, movimentos auditáveis, estoque por ingrediente, ficha técnica e relatórios por período. Separe faturamento, recebimento, taxas e margem estimada. Adicione paginação ao histórico de pedidos.

## 14. Evoluir para SaaS

> Transforme o Pronto em uma plataforma para várias empresas e lojas, com isolamento por tenant, permissões, planos, cobrança, provisionamento e testes de isolamento. Defina o processo de migração dos bancos de restaurantes que já usam o MVP.

## Comandos técnicos do projeto atual

```bash
npm ci                 # instalar dependências a partir do lockfile
npm run dev            # API e interface em desenvolvimento
npm test               # testes de API e impressão
npm run build          # valida TypeScript e compila interface
npm start              # servidor compilado em 127.0.0.1:4317
npm run desktop        # gestor Electron após build
npm run build:windows  # instalador autossuficiente Windows x64
npm run package:source # ZIP do código, excluindo dados/segredos
```
