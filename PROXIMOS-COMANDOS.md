# Próximos comandos — executar um por vez

Estes são pedidos prontos para as próximas etapas de desenvolvimento. O MVP atual já cobre cardápio → gestor → impressão. Cada etapa deve preservar esse fluxo e acrescentar testes apropriados.

## Entregue sem VPS na 0.8.0

Garçom com balão no + e mesas/contas; combos fixos com estoque compartilhado e impressão por cozinha; entregador com fila idempotente, filtros e rotas; cardápio com HTML inicial/compressão; planilha, demo fictício e backups locais. [Roteiro de apresentação](OPERACAO-LOCAL-0.8.md).

O cardápio Loja Dos Sonhos foi cadastrado a partir do texto do proprietário: 79 produtos, 15 categorias e 17 composições. Próximo comando: “Complete os itens sem preço da categoria Salgados, confirme porções/sabores dos combos e cadastre os grupos de adicionais reais, preservando preços e cozinhas.”

## 1. Validar a Elgin i8 na operação real

> Homologue o envio ESC/POS RAW e a alternativa HTML da Elgin i8 USB de 80 mm com base no teste físico: fonte, colunas, acentos, avanço, guilhotina, falta de papel e reconexão USB. Preserve os modelos por setor, o aceite antes de imprimir pedidos do cardápio e o diário que evita reenviar automaticamente uma comanda incerta. Registre os modelos/versões de driver e firmware validados.

Aceite: pedido curto e longo legíveis, sem corte de texto; falha visível; reimpressão identificada. Depende da impressora física.

## 2. Publicar para clientes fora da loja

> Prepare o Pronto em um contêiner isolado na minha VPS Integrator Host de 4 vCPUs e 6 GB de RAM, preservando o Atende Chat existente. Inspecione portas, uso real e proxy antes de alterar serviços. Publique uma instância da API com banco em volume persistente, HTTPS, backup e monitoramento; conecte o gestor Windows. Avalie a Hostinger Business para arquivos estáticos e domínio se houver benefício. Mantenha a impressão no computador da loja e entregue um procedimento de reversão.

Aceite: cliente em outra rede faz pedido, gestor recebe e Elgin imprime; dados sobrevivem a novo deploy e reinício. A migração deve preservar pedidos e evitar reaplicar comandas antigas.

## 3. Melhorar segurança e administração

> Adicione recuperação e troca de senha, revogação de dispositivos, usuários por função, auditoria de operações e backup/restauração verificável. Preserve o acesso público apenas ao cardápio e aos links de acompanhamento.

Aceite: revogação impede acesso do dispositivo e restauração recupera pedidos sem imprimir novamente.

## 4. Variantes e combos variáveis

A versão 0.8.0 já inclui combos fixos com acompanhamento por cozinha, snapshots e reserva do estoque dos componentes; a 0.3.0 trouxe grupos de complementos/adicionais.

> Acrescente tamanhos, variantes e escolha entre acompanhamentos no combo com regras de preço e distribuição por cozinha. Preserve o estoque compartilhado e snapshots dos combos fixos.

Aceite: total correto no cardápio, gestor e comanda; opção inválida não cria pedido.

## 5. Endereços com localização confirmada

> Adicione mapa ao checkout, pino ajustável, múltiplos endereços por cliente, referências e histórico de confirmação do ponto de entrega. Preserve um snapshot do endereço em cada pedido e proteja a recuperação dos dados do cliente.

Aceite: corrigir o endereço do cadastro não modifica pedidos anteriores.

## 6. Evoluir o portal dos entregadores

A 0.6.0 já traz PIN individual, atribuição, coleta/entrega/ocorrência, ponto confirmado do cliente e GPS opcional no mapa. HTTPS e acesso externo precisam da etapa de infraestrutura.

A 0.8.0 acrescenta fila idempotente de ações offline, conflitos visíveis, ordem manual/proximidade de paradas e navegação externa.

> Homologue o PWA em celulares reais com HTTPS e GPS, acrescente roteamento viário e retirada em lote transacional. Avalie aplicativo móvel se precisar de localização garantida em segundo plano. Preserve a fila e os controles de atribuição.

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

## 10. Homologar WhatsApp / Atende Chat

A 0.6.0 inclui tickets, tags/Kanban, contatos, respostas rápidas, campanhas com consentimento e adaptadores de texto Evolution/Cloud API. O adaptador Atende Chat foi implementado na 0.7.0; falta homologar no backend real e confirmar o contrato de refresh de JWT/mídia.

> Use o levantamento do Atende Chat para integrar sua conexão existente. Homologue entrada/saída, reconexão, QR, confirmações e deduplicação no número de teste. Depois acrescente mídia/transcrição, onboarding oficial e vínculo explícito com pedidos, sem duplicá-los.

Aceite: operador assume conversa e impede resposta simultânea da automação.

## 11. Avaliar IA e acrescentar ferramentas

A 0.6.0 inclui cadastro da loja, RAG lexical/FTS5, API OpenAI, sugestão, pausa por ticket e limite de chamadas. O agente orienta ao cardápio; não cria pedidos.

> Adicione uma IA de atendimento com conhecimento versionado por loja, RAG e ferramentas restritas para consultar catálogo, calcular carrinho e criar rascunhos. Preço, frete, estoque e pagamento devem ser validados pelo backend. Crie avaliações antes de liberar confirmações automáticas.

Aceite: cliente confirma o resumo; produto inexistente não entra no pedido; falha da IA permite atendimento humano.

## 12. Avaliar fine-tuning com dados revisados

A 0.6.0 inclui exemplos revisados, JSONL, solicitação de treinamento pago confirmada na tela, acompanhamento, recuperação de trabalho incerto e ativação explícita. Nenhum treinamento real foi executado.

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

## Depois da 0.4.0

- Criar insumos e fichas técnicas para vários produtos/adicionais consumirem o mesmo estoque.
- Acrescentar custos/CMV, fechamento de caixa, confirmação de pagamento e despesas aos relatórios.
- Definir áreas de entrega restritas e taxas por bairro/cidade.
- Adicionar localização confirmada no mapa, entregadores e rotas.

Já implementado na 0.4.0: relatórios de pedidos com filtros/CSV, saldo por produto com reserva transacional e histórico, CEP opcional e sugestões de cidades/bairros.
