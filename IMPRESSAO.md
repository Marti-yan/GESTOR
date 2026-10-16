# Comandas e impressoras — 0.3.0

## Configurar sem complicar

Abra **Impressão → Comandas e impressoras**. Cada cartão é uma saída independente. Expanda a saída, escolha impressora e papel e siga três passos:

1. **Modelo:** Cozinha geral, Só pedido + itens, Conferência/balcão ou Compacta.
2. **Leitura:** letras, espaço entre linhas, espaço entre itens e destaques de mesa, senha, quantidades e observações.
3. **Destaques:** qualquer categoria ou grupo de complementos/adicionais pode usar negrito, caixinha ou fundo preto.

Clique em **Salvar e aplicar modelos**. A prévia muda antes de salvar; a indicação superior informa se ainda existem alterações pendentes. Salvar atualiza o layout das comandas que ainda estão na fila. Vias reservadas ou já enviadas não mudam. O botão **Testar este modelo** usa os ajustes exibidos, mesmo antes de salvar, e imprime somente a via escolhida.

Os detalhes de colunas, recuo, codificação e guilhotina ficam recolhidos em **Ajustes de papel, guilhotina e informações**. O modelo selecionado preenche os valores iniciais; depois você pode personalizá-los.

## Modelos de exemplo já criados

| Saída | Destino e conteúdo |
|---|---|
| Comanda geral | Cozinha, todos os itens. |
| Comanda-batata | Cozinha, somente os produtos de batata reconhecidos no catálogo, usando “Só pedido + itens”. |
| Via do balcão | Conferência completa, somente quando a equipe solicitar. |

Na primeira atualização, as batatas são identificadas pelo nome ou ilustração do produto. Confira **Somente produtos escolhidos** e ajuste se seus produtos tiverem outros nomes. A geral continua mostrando as batatas para conferência; a via de batata também as repete para produção. A saída de batata não recebe pedidos sem esses produtos.

As saídas novas começam com a impressora da geral quando já houver uma configurada. Ao salvar, saídas sem impressora herdam a geral. Selecione a impressora física do balcão quando ela for diferente. Usar o mesmo nome de impressora nas duas saídas gera duas vias no mesmo equipamento.

## Total de comandas: aviso obrigatório

O total planejado aparece bem grande no início de **cada via**, seguido de sua posição, por exemplo **3 COMANDAS — VIA 2/3**. O total é repetido no final. Esse aviso não pode ser desativado nem pelo modelo enxuto.

A contagem considera as saídas ativas cujos filtros correspondem aos itens do pedido:

- Lanche sem batata: 1 via geral.
- Lanche com batata: 2 vias, geral e batata.
- Os mesmos itens com “Imprimir também no balcão”: 3 vias.

Um erro de equipamento pode impedir uma das vias de sair; o número informa o total planejado, não uma confirmação física. Confira a fila. Reimpressão mantém a identificação original e acrescenta “REIMPRESSÃO”.

Se o balcão for solicitado **depois de começar a impressão**, os papéis já enviados não podem ser alterados. A nova via recebe o total atualizado e o aviso **VIA EXTRA SOLICITADA DEPOIS**. Para numeração uniforme desde o começo, marque o balcão antes de aceitar/enviar o pedido.

## Espaçamento que funciona com letra grande

**Espaço extra entre linhas** está em milímetros. No ESC/POS, o gestor envia avanço adicional depois de cada linha, independentemente da altura da fonte. Isso corrige o controle antigo, que podia ficar encoberto pelas letras de altura dupla. A prévia HTML também usa o valor adicional.

Comece com **Normal: 0,75 mm**. **Juntas: 0 mm** economiza papel; **Espaçadas: 2 mm** facilita a leitura. Há um segundo controle para o espaço antes de cada item. Ajuste, salve e teste com o equipamento.

## Complementos e adicionais

Em **Cardápio → Complementos e adicionais**, crie um grupo, suas opções e preços. Mínimo zero torna o grupo opcional; um mínimo maior o torna obrigatório. Preço zero cria uma escolha gratuita. O limite de cada opção e do grupo é aplicado **por unidade do produto**.

Em **Editar produto**, vincule os grupos desejados. Exemplo: três lanches com uma escolha de bacon em cada um cobram três adicionais. Cardápio, gestor e garçom mostram as opções e o servidor recalcula o preço. Uma escolha inválida, fora dos limites ou indisponível impede o pedido. Alterações posteriores no cadastro não modificam os adicionais dos pedidos anteriores.

Para destacar só “Molhos” ou “Adicionais do lanche”, escolha o grupo no passo 3 de cada modelo de comanda. Os adicionais aparecem abaixo do item e identificam que as quantidades são por unidade.

## Balcão e aceite

O destino padrão é a cozinha. Marcar **Imprimir também no balcão** acrescenta uma via; não retira as comandas da cozinha.

- Gestor e garçom: caixa pequena antes do botão de enviar.
- Pedido do cardápio: abra o resumo no gestor e marque a opção antes do aceite. Depois do aceite, o resumo oferece o botão para solicitar a via extra.
- Pedido do cardápio só entra na fila ao aceitar; lançamentos internos já entram aceitos.
- Marcar pronto ou finalizar não cria outra impressão.

## Teste da Elgin i8 USB de 80 mm

1. Imprima a página de teste do Windows e selecione essa mesma fila no gestor.
2. Use papel **80 mm** e **ESC/POS — Elgin i8**. O modo envia bytes RAW pela fila do Windows, sem diálogo de impressora.
3. Comece com avanço inicial zero, PC860 e corte parcial no final.
4. Salve e teste a geral. O exemplo tem três lanches, bebidas, batata, total de R$ 110,50, troco para R$ 150 e R$ 39,50 a devolver. Confira o aviso de duas comandas.
5. Teste a batata: número grande do pedido, batata e observação, sem cliente, bebidas ou pagamento. O teste é identificado como **NÃO PRODUZIR**.
6. Confira **FIM DA COMANDA #123** antes do corte e só então ative a impressão automática.

No ESC/POS há um único comando de corte após todo o conteúdo. A distância física entre cabeça e guilhotina deixa uma margem mínima. Se os acentos estiverem incorretos, teste PC850 ou sem acentos. Se os comandos aparecerem como caracteres, confira se a fila aceita RAW ou use a alternativa **Driver Windows — HTML**; nesse modo a guilhotina depende do driver.

A aplicação verifica os bytes aceitos pelo spooler, mas isso não comprova saída de papel. Falha ou resultado incerto exige conferência antes de reimprimir.

A geração, fila e transporte simulado foram testados em Linux. A ponte nativa e a impressão física ainda precisam de validação no Windows com a Elgin.

Referências: [WritePrinter](https://learn.microsoft.com/en-us/windows/win32/printdocs/writeprinter), [avanço e corte ESC/POS](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_cv.html).
