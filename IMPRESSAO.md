# Impressão na Elgin i8 USB — 80 mm

## Configuração inicial da versão 0.2.0

1. Imprima a página de teste pelo Windows. O gestor usa o nome da fila instalada; não acessa a porta USB diretamente.
2. Abra **Impressão**, selecione a Elgin e papel **80 mm** na saída geral.
3. Expanda **Modelo, destaques e corte**. Selecione **ESC/POS — Elgin i8**. O modo padrão envia bytes RAW ao spooler e não usa tamanho de página HTML.
4. Comece com fonte normal, 48 colunas, recuo zero, avanço inicial zero, avanço extra final de 3 mm, PC860 e corte parcial. Salve.
5. Clique em **Testar**. A comanda deve conter mesa 12, senha A123, três lanches, duas latas e água, observações, total de R$ 95,60, troco para R$ 100 e R$ 4,40 a devolver. Ela termina em **FIM DA COMANDA #123**.
6. Confira o conteúdo no papel antes de ligar a impressão automática. O spooler aceitar um trabalho não comprova que o papel saiu.

O teste é identificado como **NÃO PRODUZIR**. O botão Testar usa as opções exibidas, inclusive alterações ainda não salvas. Para os próximos pedidos, é necessário salvar as saídas.

## Modelos e destaques

Cada saída tem um modelo independente:

| Modelo | Uso inicial |
|---|---|
| Expedição | Conferência, cliente, endereço quando houver, valores e troco. |
| Cozinha | Itens grandes, observações com fundo preto e sem preços. |
| Compacta | Fonte e espaçamento menores, menos papel. |

Escolher um modelo reaplica seus valores iniciais; depois ajuste os campos. Há opções independentes de destaque para quantidade acima de um, observações, mesa, senha e troco. Bebidas podem formar um grupo separado. Também é possível ajustar mensagem final, fonte, entrelinhas, colunas, recuo, avanços, acentos e guilhotina. A prévia mostra a estrutura; a fonte térmica nativa pode variar.

Para duas cozinhas, cadastre os produtos com setores, por exemplo **Cozinha quente**, **Cozinha fria** e **Bar**. Adicione uma saída por setor usando exatamente esse nome. Mantenha a geral com **Todos os setores**. A mesma impressora pode receber a geral e uma segunda comanda filtrada; impressoras diferentes também são aceitas. Setores sem itens não geram trabalho. Comandas filtradas por setor omitem endereço, telefone e valores, independentemente dos controles do modelo.

Observações por item e observação geral são preservadas. O troco mostra o valor recebido (**TROCO PARA**) e o valor calculado a devolver. Esta versão registra a forma de pagamento, sem confirmar recebimento financeiro.

## Corte e espaço em branco

No modo ESC/POS há um único comando de guilhotina, depois de todo o texto e do marcador FIM. O comando avança até a posição física de corte mais o avanço extra escolhido. Não há avanço inicial por padrão. A distância entre cabeça e guilhotina deixa uma margem física que software não elimina. O corte do trabalho anterior pode deixar essa margem no início do seguinte.

Se ainda cortar antes do FIM, pause a impressão e confira:

- A barra de título mostra **0.2.0** e o modo salvo é **ESC/POS**.
- A fila selecionada é realmente da Elgin i8 e aceita ESC/POS RAW. Uma fila virtual, redirecionada ou um monitor intermediário pode tratar os bytes de outra maneira.
- Cancele trabalhos antigos presos na fila antes de repetir o teste identificado. Não reenvie pedidos reais sem conferir o papel.
- Se os comandos aparecerem como caracteres ou não houver saída, experimente **Driver Windows — HTML** e confira a configuração do driver. Nesse modo a guilhotina é controlada pelo driver; o gestor mede o conteúdo completo antes de imprimir e rejeita comandas HTML acima de dois metros.
- Se os acentos estiverem incorretos, teste PC850 ou sem acentos; a página de caracteres depende do firmware/configuração da impressora.
- Informe o modo usado, versão do driver, se o marcador FIM apareceu e uma foto da comanda de teste. Isso permite separar problema de transporte, papel e layout.

Quando o resultado do envio for incerto, a aplicação exige conferência antes de reimprimir. A ponte Windows escreve em blocos e verifica o número de bytes aceitos; não recorta a comanda em páginas nem corta entre blocos.

## Fluxo operacional

- **Cardápio digital:** Novo → **Aceitar e iniciar preparo** → fila automática.
- **Garçom/gestor:** salvar o lançamento → Em preparo → fila automática.
- **Marcar como pronto/finalizar:** apenas avança o estado; não gera outra comanda.
- **Impressão automática desligada:** os trabalhos aguardam o computador principal ser habilitado.

## Referências técnicas

- [Windows WritePrinter](https://learn.microsoft.com/en-us/windows/win32/printdocs/writeprinter): envio RAW e conferência de bytes escritos.
- [ESC/POS GS V](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_cv.html): avanço e corte depois do conteúdo.
- [Elgin i8 — produto e documentação](https://www.elgin.com.br/): consulte o suporte do modelo para driver, firmware e comandos homologados.

A validação automatizada cobre a geração e o transporte simulado. A impressão física e o script nativo no Windows não foram executados neste ambiente Linux.
