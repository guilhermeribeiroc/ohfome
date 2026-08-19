# Gestão de equipe e ambiente de teste

## Objetivo

Simplificar o cadastro inicial do restaurante e transferir a criação de colaboradores para uma área administrativa posterior. Permitir diversos usuários por cargo e disponibilizar uma conta de demonstração com pedidos já lançados para validar a impressão manual.

## Cadastro inicial

O cadastro permanece com quatro etapas:

1. Estabelecimento;
2. Módulos;
3. Administrador;
4. Revisão.

A etapa de administrador pede somente nome, usuário e senha da conta administrativa. Não cria usuários dos módulos contratados. A revisão exibe apenas o acesso de administrador criado.

## Gestão de equipe

Uma página `Equipe`, visível somente para administradores, permite:

- listar usuários do estabelecimento, com nome, usuário, cargo e estado;
- criar novos usuários com nome, usuário, senha inicial e cargo;
- editar nome e cargo;
- redefinir a senha;
- desativar e reativar acessos.

Vários usuários podem ocupar o mesmo cargo. A seleção de cargos aceita somente papéis correspondentes aos módulos ativos do estabelecimento. O administrador não pode remover ou desativar o último administrador ativo do próprio estabelecimento.

As rotas de API autenticam a sessão e verificam o papel `admin` no servidor. Validam nome, usuário único em toda a plataforma, senha com no mínimo seis caracteres e cargo disponível para aquele estabelecimento. Senhas são armazenadas apenas como hash bcrypt.

## Conta de teste online

Depois da publicação da mudança, será criado no ambiente de produção um estabelecimento de demonstração separado, chamado `Restaurante Teste`. A conta de administrador usará o usuário `teste123` e a senha inicial fornecida no momento do provisionamento; a senha não será gravada no código ou no repositório. O estabelecimento terá produtos básicos e três pedidos ativos em estado `novo`:

- um pedido de balcão;
- um pedido de mesa;
- um pedido de delivery.

Os pedidos permitem validar o fluxo de abertura e impressão manual em uma impressora POS-58 sem interferir nos dados de outros estabelecimentos.

## Limites desta entrega

Esta entrega não inclui impressão automática. A impressão atual continua manual, acionada pelo botão de imprimir e pela impressora escolhida no navegador do computador local.

## Validação

- O cadastro cria apenas uma conta: a administradora.
- Um administrador cria, edita, desativa, reativa e redefine a senha de usuários permitidos.
- Usuários não administradores não acessam a gestão de equipe.
- Não é possível desativar o último administrador ativo.
- A conta de teste contém os três pedidos ativos definidos acima e pode abrir a impressão manual.
