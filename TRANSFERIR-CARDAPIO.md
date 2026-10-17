# Levar o catálogo para outro computador

Em **Cardápio → Levar o cardápio para outro computador**, use **Exportar catálogo JSON**. O arquivo contém categorias, produtos, preços, grupos de complementos/adicionais, opções e a ordem de apresentação. Não contém pedidos, clientes, senha, sessões, impressoras ou saldo de estoque.

No outro computador, instale/atualize o Pronto Gestor, abra a mesma seção e selecione o JSON em **Importar catálogo Pronto**. Confira o resumo de produtos novos/atualizados e confirme. Produtos com o mesmo identificador são atualizados; os demais permanecem. Histórico e estoque existentes são preservados. Novos produtos ficam sem limite até você configurar o estoque.

A importação aceita o formato `pronto-catalog/v1`, até 200 produtos, 60 grupos, 100 categorias e arquivo de até 2 MB. Exportação/importação exige acesso de administrador. Verificações são feitas antes da transação; arquivo inválido não aplica parte dos dados. Limites e configurações precisam ser conferidos antes de atender.

## Cardápio externo solicitado

Fonte solicitada: https://www.ecta.com.br/LojaDosSonhos . A tentativa de consulta retornou HTTP 403 neste ambiente; o leitor web também não conseguiu abrir a página. Não foi possível obter produtos, descrições, preços e adicionais com fidelidade. Nenhum arquivo de exemplo foi apresentado como cópia dessa loja.

Para concluir a conversão e publicar o JSON dessa loja no GitHub, é necessário fornecer uma exportação do catálogo ou o HTML/dados públicos salvos pelo navegador no computador que consegue abrir o site. O importador desta versão fica pronto para receber o arquivo convertido; ele não aceita cegamente um HTML como catálogo.
