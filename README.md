# Pronto Gestor — download para Windows

MVP 0.1.1: **cardápio digital → pedidos no gestor → impressão térmica**.

A versão **0.1.1 corrige a falha que impedia abrir o gestor** e o carregamento da tela inicial em diretórios ocultos. Para atualizar, encerre o Pronto pela bandeja e instale na mesma pasta da versão anterior; preserve `%APPDATA%\Pronto Gestor`, onde ficam seus dados.

## Instalar em outro computador

1. **[Baixe o pacote ZIP completo](https://github.com/Marti-yan/GESTOR/archive/refs/heads/downloads/windows-mvp-0.1.1.zip)** (aproximadamente 121 MB).
2. Clique com o botão direito no ZIP e escolha **Extrair tudo**. Abra a pasta extraída.
3. Dê dois cliques em **Instalar.cmd**. Ele junta as três partes, confere o SHA-256 e abre `Pronto-Gestor-0.1.1-Windows-x64.exe`.
4. Conclua a instalação e abra **Pronto Gestor**. Crie uma senha com pelo menos 12 caracteres.

O instalador inclui o servidor e o Node.js. Não é necessário Git, Node.js, Docker ou acesso ao computador original. Recomendação para o piloto: Windows 11 de 64 bits, 8 GB de RAM e pelo menos 2 GB livres em SSD, além do espaço para dados.

## Testar sem a impressora

- Mantenha a impressão automática desligada.
- Clique no botão do celular, no topo do gestor, para abrir o cardápio. Você pode usar o navegador do próprio computador ou um celular no mesmo Wi-Fi.
- Envie um pedido e confira em **Pedidos → Novos**. Visualize a comanda e avance pelos estados de preparo.

## Testar com a Elgin i8 USB de 80 mm

Instale o driver Windows da impressora e imprima a página de teste do Windows. No gestor, abra **Impressão**, selecione a Elgin em **Comanda geral**, escolha **80 mm**, salve e clique em **Testar**. Depois, ative a impressão automática e envie outro pedido pelo cardápio.

Confira o passo a passo completo em [COMECAR-AQUI.md](COMECAR-AQUI.md).

## Sobre o pacote

O `.exe` tem 121 MB e excede o limite de arquivo comum do GitHub. As três partes deste pacote permitem disponibilizar o instalador existente enquanto a publicação por GitHub Releases é configurada. `Instalar.cmd` apenas junta arquivos locais, verifica sua integridade e abre o instalador; ele não baixa programas nem altera as proteções do Windows.

O SHA-256 esperado está em [SHA256SUMS.txt](SHA256SUMS.txt). Se a conferência falhar, o instalador não será aberto pelo script. Não execute diretamente as partes `.bin`.

## Limites do MVP

- O cardápio atende a rede local; o computador precisa estar ligado com o aplicativo ativo.
- Cada instalação usa um banco próprio, sem sincronização automática entre computadores.
- O catálogo contém produtos de exemplo editáveis. Os pagamentos são feitos na entrega ou retirada.
- O aplicativo não possui certificado de assinatura comercial. O instalador não foi executado em Windows real neste ambiente, e a saída física na Elgin ainda precisa ser validada.

Código-fonte e documentação: [MVP no GitHub](https://github.com/Marti-yan/GESTOR/tree/codex/mvp-pronto-gestor). Alterações para revisão: [PR #1](https://github.com/Marti-yan/GESTOR/pull/1).
