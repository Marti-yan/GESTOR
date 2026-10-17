Pronto Gestor 0.4.0: relatórios, estoque reservado e endereço estruturado.

- Relatórios com filtros, indicadores, 15 agrupamentos, tempos médios e CSV de resumo, pedidos e itens.
- Quantidade limitada por produto; reserva transacional impede vendas simultâneas acima do saldo, com histórico e ajuste protegido contra saldo desatualizado.
- Cancelamento antes do preparo devolve a reserva. Após aceitar, reposição é manual para evitar reutilizar ingrediente já consumido.
- Endereços com CEP opcional via ViaCEP; cadastro de cidades/bairros e lançamento de entrega também no gestor/garçom.
- Mantém aceite antes da impressão para cardápio e aceite/impressão diretos no gestor e garçom.

Relatórios representam pedidos, não caixa conciliado nem lucro. Estoque por insumo compartilhado/ficha técnica será etapa posterior. Endereços cadastrados são sugestões, com taxa geral da loja.

Atualize em Minha loja → Atualizações (0.3.0+) ou use Reparar-Pronto-0.4.0.exe com o gestor fechado pela bandeja. Dados locais são preservados. Consulte RELATORIOS-ESTOQUE-ENDERECOS.md para regras e limitações. Não há implantação em VPS nesta versão. A consulta externa real ao ViaCEP e a impressão física devem ser conferidas no computador Windows; o ambiente de desenvolvimento testou a API de CEP com respostas simuladas.
