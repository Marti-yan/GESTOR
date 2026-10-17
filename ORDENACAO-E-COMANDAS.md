# Ordenação, seleção e interface — 0.5.0

## Catálogo

Em Cardápio, as setas ao lado de Editar mudam a posição do produto dentro da própria categoria. A ordem é persistida e usada no cardápio, gestor e garçom. Ao filtrar/buscar, as setas continuam relativas à categoria completa; se a lista tiver mudado em outra tela, atualize antes de repetir.

As categorias continuam com suas setas no painel de categorias. Na lista de complementos/adicionais, ordene os grupos com as setas. Dentro de Editar grupo, ordene as opções e salve. Em Editar produto, os grupos vinculados também têm uma ordem própria: marque os grupos e use as setas para definir sua apresentação nesse produto. Os pedidos guardam o nome, preço e ordem das escolhas no momento do envio; alterar o cadastro não modifica o histórico.

## Seleção e estoque

O seletor do produto, os botões do carrinho e o lançamento do gestor/garçom respeitam o saldo consultado. Todas as linhas do mesmo produto são somadas, mesmo que tenham adicionais ou observações diferentes. Ao editar uma linha, o limite considera as outras linhas, excluindo a linha editada. Se três unidades já estiverem selecionadas e o saldo for três, não dá para acrescentar mais uma.

O estoque continua reservado **no envio**, não ao abrir o seletor. Se outro cliente consumir o saldo enquanto seu carrinho está aberto, o servidor verifica novamente e informa o conflito. Não existe promessa de reserva pelo simples clique em “+”. Isso preserva a proteção contra vendas simultâneas acima do estoque. O motivo do ajuste manual é opcional; se estiver vazio, o histórico registra “Ajuste manual”.

## Interface e endereços

O lançamento no gestor usa um modal maior, com espaço interno e campos de mesa/senha em linhas completas. O painel de finalização tem rolagem própria em telas largas e fica abaixo dos itens em telas menores. Carrinho e demais modais mantêm rolagem para alcançar os botões finais. O editor de impressão também pode encolher sem alargar a página.

As rotas de cidades/bairros e CEP passaram a ser permitidas na ponte do Electron, que causava “Operação não permitida”. Testadas pelo próprio aplicativo, não apenas pelo navegador. O bloco “Conexão do aplicativo” foi removido de Minha loja; a configuração técnica ainda pode ser acessada antes do login quando necessária.

## Comandas

Consulte [IMPRESSAO.md](IMPRESSAO.md). A via do balcão fica fora da numeração da cozinha. Pode-se agrupar categorias na ordem escolhida por saída, envolver a categoria inteira em uma caixa/fundo ou destacar cada item separadamente. Nomes em negrito podem crescer mesmo com quantidade 1; há exceções por produto.

## Validação

Testes de migração, concorrência, histórico, numeração, agrupamento, fonte ESC/POS, importação e políticas da API. Fluxos de estoque, endereços, ordenação, importação e editor de impressão conferidos em Electron/Linux; cardápio e carrinho também a 390 px. Instalação nativa Windows e impressão física na Elgin precisam de conferência no restaurante. A operação permanece local.
