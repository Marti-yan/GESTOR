# Relatórios, estoque e endereços — 0.4.0

## Relatórios

Abra **Relatórios** no gestor. O período padrão é hoje. Use Aplicar filtros após alterar datas (inclusivas), situação, origem, pagamento, atendimento, categoria, produto, operador/garçom, mesa, cidade, bairro ou busca por nome/telefone/número. Datas usam o fuso informado pelo computador; origem do período é a criação do pedido. Cidade e bairro usam o endereço estruturado dos novos pedidos; endereços antigos continuam no texto original.

Indicadores: pedidos, concluídos, cancelados, valor não cancelado, valor concluído, valor cancelado, subtotal de produtos, taxas, ticket médio e unidades. Médias de tempo até aceitar, até ficar pronto e até concluir mostram a quantidade de amostras. Pedidos ainda sem o evento correspondente não entram na média.

Agrupamentos por dia, hora, situação, origem, pagamento, atendimento, operador, mesa, cidade, bairro, cliente, produto, categoria e adicional. Os agrupamentos excluem cancelados, exceto a distribuição por situação. “Valor concluído” não significa dinheiro efetivamente recebido: ainda não existe baixa financeira, contas a pagar, custos/CMV, lucro ou conciliação de cartão. Não confunda relatório de pedidos com fechamento de caixa.

Filtro de produto/categoria seleciona pedidos que contêm aquele item e restringe o agrupamento e exportação de itens às linhas escolhidas. O valor total desses pedidos continua integral (inclui outros produtos e entrega). Adicionais estão incluídos no preço do produto; a análise separada de adicionais não deve ser somada de novo ao faturamento.

CSV: resumo do agrupamento, todos os pedidos filtrados e itens detalhados. Exportações usam ponto e vírgula, BOM UTF-8 e proteção contra fórmulas em células. A tabela exibe 50 pedidos por página; exportação inclui todos os resultados, até 20.000 pedidos. Acima disso, reduza o período. Os filtros aplicados permanecem associados ao resultado mesmo se você editar os campos antes da próxima consulta.

## Estoque

Abra **Estoque**, localize o produto e escolha **Ajustar**. Para ter somente três pastéis de carne disponíveis, ative o limite e informe **3** no produto correspondente. O saldo é o disponível para novas vendas, além de unidades já reservadas; não é o estoque físico total. Sem limite mantém o comportamento anterior. Saldo zero exibe esgotado.

O servidor é a autoridade. Carrinho/rascunho não reserva. Ao enviar o pedido, a transação SQLite BEGIN IMMEDIATE soma todas as linhas do mesmo produto, desconta condicionalmente o saldo e grava o pedido e a movimentação juntos. Se faltar qualquer item, a cesta inteira é revertida e nada entra na fila de impressão. Pedidos simultâneos não vendem as mesmas unidades. Reenvio com a mesma chave não desconta novamente. Não é necessário Redis nem VPS para essa coordenação local.

Pedidos públicos novos seguram a reserva até o gestor aceitar ou cancelar, sem expiração automática: expirar silenciosamente poderia liberar estoque de um pedido que o cliente acredita confirmado. Confira a coluna Novos e cancele pedidos abandonados. Ao cancelar antes do preparo, a reserva volta uma única vez. Após aceitar/iniciar preparo, cancelar NÃO devolve o ingrediente automaticamente: ajuste manualmente só o que puder ser reaproveitado. Pedidos antigos ou recebidos enquanto o produto estava sem limite também passam pela reserva antes de entrar na cozinha, caso um limite tenha sido ativado depois.

Gestor/garçom reservam e aceitam imediatamente; o cardápio reserva e continua aguardando aceite para imprimir. O histórico mostra as últimas 500 movimentações. Ajustes exigem a versão de saldo consultada: se um pedido mudar o saldo enquanto o formulário está aberto, o ajuste é recusado. Use Recarregar saldo atual, confira a quantidade e salve novamente.

Nesta versão o controle é **por produto**, não por ficha técnica/ingrediente compartilhado nem por opção de adicional. Para várias receitas consumirem o mesmo estoque de carne, a próxima etapa é estoque de insumos com ficha técnica. A reserva ocorre por ordem de chegada ao servidor, não pela ordem em que os clientes abriram o cardápio. Cardápio e lançamento consultam saldos a cada dez segundos e ao retornar à janela; o servidor valida novamente no envio.

## Endereços

Abra **Endereços** e cadastre cidades com UF e bairros (um por linha). Essas listas são sugestões para agilizar o preenchimento, não uma restrição de área de entrega. A taxa continua a taxa geral da loja. Não há taxa por bairro nesta versão.

No cardápio ou em lançamento do gestor/garçom, escolha Entrega. Você pode buscar um CEP ou preencher tudo manualmente. Rua, número (aceita S/N), bairro, cidade e UF são obrigatórios; CEP, complemento e referência são opcionais. ViaCEP não exige chave nem cobrança; o servidor faz a consulta com limite de requisições, timeout e cache. Em caso de falha ou CEP inexistente, continue manualmente. Nenhum nome/telefone é enviado ao ViaCEP, apenas o CEP digitado.

O endereço estruturado e sua versão textual ficam no pedido e nas comandas que já exibem endereço. O link público de acompanhamento não divulga endereço nem telefone. Pedidos antigos permanecem legíveis. Esta versão não adiciona mapa, geocodificação, GPS nem rotas.

## Validação e instalação

Banco migrado sem apagar pedidos nem recriar impressão. Testes incluem disputa de 3 unidades por 10 pedidos, linhas duplicadas, rollback, idempotência, cancelamento, limite ativado com pedido pendente, endereço manual, API de CEP simulada, privacidade, relatórios e datas/fuso.

O ambiente de desenvolvimento restringe acesso externo ao domínio ViaCEP; consulta real não foi validada aqui. Sucesso, ausência de CEP e falha de rede foram validados com respostas simuladas. A consulta real usa HTTPS normal no computador que executa o gestor e requer internet; o preenchimento manual funciona sem a API.

Atualize a partir da 0.3.0 em Minha loja → Atualizações ou feche o gestor pela bandeja e execute Reparar-Pronto-0.4.0.exe. Dados permanecem no APPDATA. Confira a impressão automática depois da atualização. Mantém teste local: nenhuma VPS foi alterada.
