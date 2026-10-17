import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomUUID } from "crypto";
import { autenticarRequisicao, respostaAcessoNegado, respostaNaoAutenticado, sessaoPodeAcessarModulo } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import { accessTokenDoEstabelecimento, criarCobrancaPixMercadoPago, emailTecnicoPix, MercadoPagoErro } from "@/lib/mercado-pago";

const PEDIDOS_ATIVOS_QUERY = `
  select
    p.id, p.codigo, p.tipo, p.origem, p.status, p.total, p.observacoes, p.forma_recebimento as "formaRecebimento", p.forma_pagamento as "formaPagamento", p.tipo_cartao as "tipoCartao", p.troco_para as "trocoPara", p.pagamento_dividido as "pagamentoDividido", p.pagamento_status as "pagamentoStatus", p.created_at as "createdAt", p.notificado_em as "notificadoEm",
    (p.whatsapp_consentimento and exists (select 1 from estabelecimentos ew where ew.id = p.estabelecimento_id and ew.whatsapp_automacao_ativa and ew.whatsapp_instancia is not null)) as "notificacaoAutomatica",
    m.numero as "mesaNumero",
    coalesce(c.nome, p.cliente_nome_avulso) as "clienteNome",
    c.telefone as "clienteTelefone",
    e.endereco as "enderecoEntrega",
    u.nome as "usuarioNome",
    pai.codigo as "pedidoPaiCodigo",
    coalesce(
      (
        select json_agg(json_build_object(
          'id', ip.id,
          'produtoId', ip.produto_id,
          'produtoNome', pr.nome || case when ip.tamanho is not null then ' (' || ip.tamanho::text || ')' else '' end,
          'produtoTamanho', ip.tamanho,
          'categoriaNome', (select cp.nome from categorias_produto cp where cp.id = pr.categoria_id),
          'quantidade', ip.quantidade,
          'precoUnitario', ip.preco_unitario,
          'observacoes', ip.observacoes,
          'status', ip.status,
          'pizza', (select json_build_object(
            'tamanhoNome', ipp.tamanho_nome,
            'saborUmNome', ipp.sabor_um_nome,
            'saborDoisNome', ipp.sabor_dois_nome,
            'regraMeioAMeio', ipp.regra_meio_a_meio
          ) from itens_pedido_pizza ipp where ipp.item_pedido_id = ip.id),
          'opcoes', coalesce((
            select json_agg(json_build_object(
              'grupoNome', ipo.grupo_nome,
              'opcaoNome', ipo.opcao_nome,
              'acrescimo', ipo.acrescimo
            ) order by ipo.created_at)
            from itens_pedido_opcoes ipo
            where ipo.item_pedido_id = ip.id
          ), '[]')
        ) order by ip.created_at)
        from itens_pedido ip
        join produtos pr on pr.id = ip.produto_id
        where ip.pedido_id = p.id
      ),
      '[]'
    ) as itens
  from pedidos p
  left join comandas cm on cm.id = p.comanda_id
  left join mesas m on m.id = cm.mesa_id
  left join clientes c on c.id = p.cliente_id
  left join entregas e on e.pedido_id = p.id
  left join usuarios u on u.id = p.usuario_id
  left join pedidos pai on pai.id = p.pedido_pai_id
`;

export async function GET(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const origem = new URL(request.url).searchParams.get("origem");

  const pedidos = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query(
      `${PEDIDOS_ATIVOS_QUERY}
       where p.status not in ('finalizado', 'cancelado')
         and ($1::pedido_origem is null or p.origem = $1)
       order by p.created_at asc`,
      [origem]
    );
    return rows;
  });

  const podeVerContatoDoCliente = sessao.role === "admin"
    || sessaoPodeAcessarModulo(sessao, "balcao")
    || sessaoPodeAcessarModulo(sessao, "delivery");
  return NextResponse.json(pedidos.map((pedido) => ({
    ...pedido,
    clienteTelefone: podeVerContatoDoCliente ? pedido.clienteTelefone : null,
    enderecoEntrega: podeVerContatoDoCliente ? pedido.enderecoEntrega : null,
  })));
}

interface ItemInput {
  produtoId?: string;
  quantidade?: number;
  observacoes?: string;
  opcoes?: { grupoId?: string; opcaoId?: string }[];
  pizza?: { tamanhoId?: string; saborUmId?: string; saborDoisId?: string };
}

export async function POST(request: NextRequest) {
  const sessao = await autenticarRequisicao(request);
  if (!sessao) return respostaNaoAutenticado();

  const body = await request.json().catch(() => null);
  const tipo = body?.tipo;
  const mesaId = body?.mesaId;
  const clienteNome = typeof body?.clienteNome === "string" ? body.clienteNome.trim() : undefined;
  const clienteNomeAvulso = typeof body?.clienteNomeAvulso === "string" ? body.clienteNomeAvulso.trim().slice(0, 80) || null : null;
  const observacoesPedido = typeof body?.observacoes === "string" ? body.observacoes.trim().slice(0, 500) || null : null;
  const clienteIdInformado = typeof body?.clienteId === "string" ? body.clienteId : undefined;
  const clienteTelefone = typeof body?.clienteTelefone === "string" ? body.clienteTelefone.replace(/\D/g, "") || null : null;
  const endereco = typeof body?.endereco === "string" ? body.endereco.trim() : undefined;
  const bairroId = typeof body?.bairroId === "string" ? body.bairroId : undefined;
  const itensInput: ItemInput[] = Array.isArray(body?.itens) ? body.itens : [];
  const formaPagamento = body?.formaPagamento;
  const tipoCartao = body?.tipoCartao;
  const trocoPara = Number(body?.trocoPara);
  const modalidade = body?.modalidade === "imediata" ? "imediata" : "preparo";
  const confirmarRecebimento = body?.confirmarRecebimento === true;
  const atualizarCliente = body?.atualizarCliente === true;
  const formaRecebimento = tipo === "balcao" && body?.formaRecebimento === "retirada" ? "retirada" : null;
  const whatsappConsentimento = body?.whatsappConsentimento === true;
  const pixAutomatico = body?.pixAutomatico === true;
  const chaveIdempotencia = request.headers.get("Idempotency-Key") ?? (typeof body?.chaveIdempotencia === "string" ? body.chaveIdempotencia : randomUUID());

  if (tipo !== "mesa" && tipo !== "balcao" && tipo !== "delivery") {
    return NextResponse.json({ erro: "Tipo de pedido inválido." }, { status: 400 });
  }
  const podeCriarPedido = sessao.role === "admin"
    || (tipo === "mesa" && sessaoPodeAcessarModulo(sessao, "garcom"))
    || (tipo === "balcao" && sessaoPodeAcessarModulo(sessao, "balcao"))
    || (tipo === "delivery" && (sessaoPodeAcessarModulo(sessao, "balcao") || sessaoPodeAcessarModulo(sessao, "delivery")));
  if (!podeCriarPedido) return respostaAcessoNegado();
  if (tipo === "mesa" && typeof mesaId !== "string") {
    return NextResponse.json({ erro: "Informe a mesa." }, { status: 400 });
  }
  if (tipo === "delivery" && ((!clienteNome && !clienteIdInformado) || !endereco || !bairroId)) {
    return NextResponse.json({ erro: "Informe cliente, endereço e bairro para delivery." }, { status: 400 });
  }
  if (formaRecebimento === "retirada" && !clienteNome && !clienteIdInformado) {
    return NextResponse.json({ erro: "Selecione o cliente para a retirada." }, { status: 400 });
  }
  if (modalidade === "imediata" && tipo !== "balcao") return NextResponse.json({ erro: "Venda imediata é exclusiva do balcão." }, { status: 400 });
  if (modalidade === "imediata" && !pixAutomatico && (!confirmarRecebimento || !formaPagamento)) {
    return NextResponse.json({ erro: "Confirme a entrega e o recebimento para concluir a venda imediata." }, { status: 400 });
  }
  if (chaveIdempotencia.length < 16 || chaveIdempotencia.length > 200) return NextResponse.json({ erro: "Chave de confirmação inválida." }, { status: 400 });
  if (formaPagamento !== undefined) {
    if (!["dinheiro", "cartao", "pix"].includes(formaPagamento)) {
      return NextResponse.json({ erro: "Forma de pagamento inválida." }, { status: 400 });
    }
    if (formaPagamento === "cartao" && tipoCartao !== "credito" && tipoCartao !== "debito") {
      return NextResponse.json({ erro: "Informe crédito ou débito." }, { status: 400 });
    }
  }
  if (pixAutomatico && formaPagamento !== "pix") {
    return NextResponse.json({ erro: "Pix automático precisa usar a forma de pagamento Pix." }, { status: 400 });
  }
  if (pixAutomatico && tipo === "mesa") {
    return NextResponse.json({ erro: "Pix automático está disponível para balcão, retirada e delivery." }, { status: 400 });
  }
  const itensValidos = itensInput.filter(
    (i): i is ItemInput & { produtoId: string; quantidade: number } => typeof i.produtoId === "string" && Number.isInteger(i.quantidade) && (i.quantidade ?? 0) > 0
  );
  if (itensValidos.length === 0) {
    return NextResponse.json({ erro: "O pedido precisa de ao menos um item." }, { status: 400 });
  }

  try {
    const criado = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const hashConteudo = createHash("sha256").update(JSON.stringify({
        tipo, mesaId, observacoesPedido, clienteIdInformado, clienteNome, clienteNomeAvulso, clienteTelefone, endereco, bairroId, itens: itensValidos,
        formaPagamento, tipoCartao, trocoPara: Number.isFinite(trocoPara) ? trocoPara : null, modalidade,
        formaRecebimento, whatsappConsentimento, pixAutomatico,
      })).digest("hex");
      const { rows: chaveExistente } = await client.query(
        `select pedido_id as "pedidoId", hash_conteudo as hash from pedidos_idempotencia
         where estabelecimento_id = $1 and chave = $2 for update`,
        [sessao.estabelecimentoId, chaveIdempotencia]
      );
      if (chaveExistente[0]) {
        if (chaveExistente[0].hash !== hashConteudo) throw Object.assign(new Error("Esta confirmação já foi usada para outro pedido."), { status: 409 });
        return { pedidoId: chaveExistente[0].pedidoId as string, repetido: true, pixAutomatico };
      }
      // Preco sempre vem do banco, nunca do cliente.
      const idsProdutos = itensValidos.map((i) => i.produtoId);
      const { rows: produtosRows } = await client.query(
        `select id, preco_venda, tipo_produto as "tipoProduto" from produtos where id = any($1::uuid[]) and ativo`,
        [idsProdutos]
      );
      const produtoPorId = new Map<string, { preco: number; tipoProduto: string }>(produtosRows.map((r) => [r.id, { preco: Number(r.preco_venda), tipoProduto: r.tipoProduto }]));
      if (produtoPorId.size !== new Set(idsProdutos).size) {
        throw Object.assign(new Error("Produto inválido ou inexistente."), { status: 400 });
      }

      let comandaId: string | null = null;
      if (tipo === "mesa") {
        // A busca da mesa passa pela RLS de "mesas": se o mesaId nao for
        // desta tenant, vem vazio e barra aqui, antes de tocar em comandas
        // (que nao tem RLS propria, so o vinculo com a mesa).
        const { rows: mesaValida } = await client.query(`select id from mesas where id = $1`, [mesaId]);
        if (mesaValida.length === 0) {
          throw Object.assign(new Error("Mesa inválida."), { status: 400 });
        }

        const { rows: comandaAberta } = await client.query(
          `select id from comandas where mesa_id = $1 and status = 'aberta'`,
          [mesaId]
        );
        if (comandaAberta.length > 0) {
          comandaId = comandaAberta[0].id;
        } else {
          const { rows: novaComanda } = await client.query(
            `insert into comandas (mesa_id, garcom_id) values ($1, $2) returning id`,
            [mesaId, sessao.usuarioId]
          );
          comandaId = novaComanda[0].id;
        }
      }

      let clienteId: string | null = null;
      if (clienteIdInformado) {
        const { rows } = await client.query(`select id from clientes where id = $1`, [clienteIdInformado]);
        if (!rows[0]) throw Object.assign(new Error("Cliente inválido."), { status: 400 });
        clienteId = rows[0].id;
        if (atualizarCliente && (clienteNome || endereco || clienteTelefone)) {
          await client.query(
            `update clientes set nome = coalesce($2, nome), telefone = coalesce($3, telefone), endereco = coalesce($4, endereco) where id = $1`,
            [clienteId, clienteNome || null, clienteTelefone, endereco || null]
          );
        }
      } else if ((tipo === "delivery" || formaRecebimento === "retirada") && clienteNome) {
        const { rows } = await client.query(
          `insert into clientes (estabelecimento_id, nome, telefone, endereco)
           values ($1, $2, $3, $4)
           on conflict (estabelecimento_id, telefone) do update
             set nome = excluded.nome, endereco = coalesce(excluded.endereco, clientes.endereco)
           returning id`,
          [sessao.estabelecimentoId, clienteNome, clienteTelefone, endereco ?? null]
        );
        clienteId = rows[0].id;
      } else if (clienteNomeAvulso) {
        // Nome digitado no balcão/mesa: vira (ou reaproveita) um cliente, sem telefone.
        // Reaproveita o de mesmo nome sem telefone para não duplicar a cada pedido.
        const { rows: existente } = await client.query(
          `select id from clientes where estabelecimento_id = $1 and lower(nome) = lower($2) and telefone is null order by created_at limit 1`,
          [sessao.estabelecimentoId, clienteNomeAvulso]
        );
        if (existente[0]) clienteId = existente[0].id;
        else {
          const { rows } = await client.query(`insert into clientes (estabelecimento_id, nome) values ($1, $2) returning id`, [sessao.estabelecimentoId, clienteNomeAvulso]);
          clienteId = rows[0].id;
        }
      }

      let bairroNome: string | null = null;
      let taxaEntrega = 0;
      if (tipo === "delivery" && bairroId) {
        const { rows: bairroRows } = await client.query(
        `select nome, taxa from bairros_entrega where id = $1 and ativo`,
          [bairroId]
        );
        if (bairroRows.length === 0) throw Object.assign(new Error("Bairro inválido."), { status: 400 });
        bairroNome = bairroRows[0].nome;
        taxaEntrega = bairroRows[0].taxa;
      }

      const { rows: pedidoRows } = await client.query(
        `insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, enviado_cozinha_em, comanda_id, cliente_id, usuario_id, taxa_entrega, forma_pagamento, tipo_cartao, troco_para, modalidade_atendimento, pagamento_status, forma_recebimento, whatsapp_consentimento, cliente_nome_avulso, observacoes)
         values ($1, $2, 'presencial', $3, $4, case when $4 then now() else null end, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         returning id`,
        [
          sessao.estabelecimentoId, tipo,
          modalidade === "imediata" && !pixAutomatico ? "finalizado" : "novo", modalidade !== "imediata" && !pixAutomatico,
          comandaId, clienteId, sessao.usuarioId, taxaEntrega,
          formaPagamento ?? null,
          formaPagamento === "cartao" ? tipoCartao : null,
          formaPagamento === "dinheiro" && trocoPara > 0 ? trocoPara : null,
          modalidade, modalidade === "imediata" && !pixAutomatico ? "pago" : "pendente",
          formaRecebimento, whatsappConsentimento && clienteId !== null,
          clienteId ? null : clienteNomeAvulso,
          observacoesPedido,
        ]
      );
      const pedidoId = pedidoRows[0].id;

      for (const item of itensValidos) {
        const produto = produtoPorId.get(item.produtoId);
        if (!produto) throw Object.assign(new Error("Produto inválido ou inexistente."), { status: 400 });
        let precoPizza = produto.preco;
        let pizzaSnapshot: { tamanhoNome: string; saborUmNome: string; saborDoisNome: string | null; regraMeioAMeio: string | null } | null = null;
        if (produto.tipoProduto === "pizza") {
          const pizza = item.pizza;
          if (!pizza || typeof pizza.tamanhoId !== "string" || typeof pizza.saborUmId !== "string" || (pizza.saborDoisId !== undefined && typeof pizza.saborDoisId !== "string")) throw Object.assign(new Error("Escolha tamanho e sabor da pizza."), { status: 400 });
          const { rows: configuracao } = await client.query(`select regra_meio_a_meio as "regraMeioAMeio" from produto_configuracoes_pizza where produto_id = $1`, [item.produtoId]);
          const { rows: tamanhos } = await client.query(`select id, nome, preco_sabor_unico as "precoSaborUnico", preco_meio_a_meio as "precoMeioAMeio", permite_meio_a_meio as "permiteMeioAMeio" from pizza_tamanhos where id = $1 and produto_id = $2 and ativo`, [pizza.tamanhoId, item.produtoId]);
          const idsSabores = [pizza.saborUmId, pizza.saborDoisId].filter((valor): valor is string => typeof valor === "string");
          if (!configuracao[0] || !tamanhos[0] || new Set(idsSabores).size !== idsSabores.length) throw Object.assign(new Error("Configuração de pizza inválida."), { status: 400 });
          // O 1º sabor é sempre desta pizza. O 2º pode vir de outra pizza ativa do estabelecimento
          // (ex.: metade salgada, metade doce) desde que ela tenha o mesmo tamanho.
          const { rows: sabores } = await client.query(`select s.id, s.produto_id as "produtoId", s.nome, s.acrescimo, s.permite_meio_a_meio as "permiteMeioAMeio" from pizza_sabores s join produtos pr on pr.id = s.produto_id and pr.ativo where s.id = any($1::uuid[]) and s.ativo`, [idsSabores]);
          if (sabores.length !== idsSabores.length) throw Object.assign(new Error("Sabor de pizza inválido."), { status: 400 });
          const saborUm = sabores.find((sabor) => sabor.id === pizza.saborUmId)!;
          const saborDois = pizza.saborDoisId ? sabores.find((sabor) => sabor.id === pizza.saborDoisId)! : null;
          if (saborUm.produtoId !== item.produtoId) throw Object.assign(new Error("Sabor de pizza inválido."), { status: 400 });
          const tamanho = tamanhos[0]; const regra = configuracao[0].regraMeioAMeio as string;
          if (saborDois && (!tamanho.permiteMeioAMeio || !saborUm.permiteMeioAMeio || !saborDois.permiteMeioAMeio)) throw Object.assign(new Error(!tamanho.permiteMeioAMeio ? "Este tamanho de pizza não aceita meio a meio." : "Um dos sabores não pode ser combinado no meio a meio."), { status: 400 });
          let tamanhoDoSaborDois = tamanho;
          if (saborDois && saborDois.produtoId !== item.produtoId) {
            const { rows: equivalentes } = await client.query(`select id, nome, preco_sabor_unico as "precoSaborUnico", preco_meio_a_meio as "precoMeioAMeio", permite_meio_a_meio as "permiteMeioAMeio" from pizza_tamanhos where produto_id = $1 and lower(nome) = lower($2) and ativo`, [saborDois.produtoId, tamanho.nome]);
            if (!equivalentes[0]) throw Object.assign(new Error(`${saborDois.nome} não é vendido no tamanho ${tamanho.nome}.`), { status: 400 });
            if (!equivalentes[0].permiteMeioAMeio) throw Object.assign(new Error("Este tamanho de pizza não aceita meio a meio."), { status: 400 });
            tamanhoDoSaborDois = equivalentes[0];
          }
          // Preço próprio do sabor naquele tamanho (tabela do cardápio) sobrepõe tamanho + acréscimo.
          const { rows: precosSabor } = await client.query(`select sabor_id as "saborId", tamanho_id as "tamanhoId", preco from pizza_sabor_precos where sabor_id = any($1::uuid[])`, [idsSabores]);
          const tamanhoDoSabor = (sabor: { id: string }) => (sabor.id === saborDois?.id ? tamanhoDoSaborDois : tamanho);
          // Sabor com tabela de preços só é vendido nos tamanhos em que tem preço.
          for (const sabor of [saborUm, saborDois]) if (sabor && precosSabor.some((linha) => linha.saborId === sabor.id) && !precosSabor.some((linha) => linha.saborId === sabor.id && linha.tamanhoId === tamanhoDoSabor(sabor).id)) throw Object.assign(new Error(`${sabor.nome} não é vendido no tamanho ${tamanho.nome}.`), { status: 400 });
          const valorDoSabor = (sabor: { id: string; acrescimo: unknown }) => { const base = tamanhoDoSabor(sabor); const proprio = precosSabor.find((linha) => linha.saborId === sabor.id && linha.tamanhoId === base.id); return proprio ? Number(proprio.preco) : Number(base.precoSaborUnico) + Number(sabor.acrescimo); };
          const valorUm = valorDoSabor(saborUm);
          const valorDois = saborDois ? valorDoSabor(saborDois) : null;
          precoPizza = !saborDois ? valorUm : regra === "maior_valor" ? Math.max(valorUm, valorDois!) : regra === "media" ? (valorUm + valorDois!) / 2 : Number(tamanho.precoMeioAMeio);
          pizzaSnapshot = { tamanhoNome: tamanho.nome, saborUmNome: saborUm.nome, saborDoisNome: saborDois?.nome ?? null, regraMeioAMeio: saborDois ? regra : null };
        } else if (item.pizza !== undefined) throw Object.assign(new Error("Este produto não é uma pizza configurável."), { status: 400 });
        // Apps/estações que ainda não exibem o configurador enviam o campo
        // ausente e continuam compatíveis. Quando o campo vem (inclusive []),
        // todas as regras de mínimo/máximo passam a ser obrigatórias.
        const opcoesFornecidas = Array.isArray(item.opcoes);
        const escolhas = Array.isArray(item.opcoes) ? item.opcoes : [];
        if (escolhas.some((escolha) => typeof escolha?.grupoId !== "string" || typeof escolha?.opcaoId !== "string")) {
          throw Object.assign(new Error("Opções do produto inválidas."), { status: 400 });
        }
        const opcaoIds = escolhas.map((escolha) => escolha.opcaoId as string);
        if (new Set(opcaoIds).size !== opcaoIds.length) {
          throw Object.assign(new Error("Não repita a mesma opção."), { status: 400 });
        }
        const { rows: grupos } = await client.query(
          `select id, nome, minimo_selecoes as "minimoSelecoes", maximo_selecoes as "maximoSelecoes", define_preco as "definePreco"
           from produto_grupos_opcoes where produto_id = $1 and ativo order by ordem, nome`,
          [item.produtoId]
        );
        const { rows: opcoes } = opcaoIds.length ? await client.query(
          `select o.id, o.grupo_id as "grupoId", o.nome, o.acrescimo, g.nome as "grupoNome", g.define_preco as "definePreco"
           from produto_opcoes o
           join produto_grupos_opcoes g on g.id = o.grupo_id
           where o.id = any($1::uuid[]) and o.ativo and g.ativo and g.produto_id = $2`,
          [opcaoIds, item.produtoId]
        ) : { rows: [] as { id: string; grupoId: string; nome: string; acrescimo: number; grupoNome: string; definePreco: boolean }[] };
        if (opcoes.length !== escolhas.length || opcoes.some((opcao) => !escolhas.some((escolha) => escolha.opcaoId === opcao.id && escolha.grupoId === opcao.grupoId))) {
          throw Object.assign(new Error("Uma opção não pertence a este produto."), { status: 400 });
        }
        for (const grupo of grupos) {
          const quantidade = opcoes.filter((opcao) => opcao.grupoId === grupo.id).length;
          if ((opcoesFornecidas || grupo.definePreco) && (quantidade < Number(grupo.minimoSelecoes) || quantidade > Number(grupo.maximoSelecoes))) {
            throw Object.assign(new Error(`Escolha entre ${grupo.minimoSelecoes} e ${grupo.maximoSelecoes} opção(ões) em ${grupo.nome}.`), { status: 400 });
          }
        }
        // Pergunta que DEFINE o preço (pão Bola/Árabe): o preço da opção é o preço completo do item.
        const acrescimo = opcoes.reduce((total, opcao) => total + Number(opcao.acrescimo), 0);
        const baseDoItem = opcoes.some((opcao) => opcao.definePreco) ? 0 : precoPizza;
        const { rows: itensCriados } = await client.query(
          `insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, observacoes)
           values ($1, $2, $3, $4, $5) returning id`,
          [pedidoId, item.produtoId, item.quantidade, baseDoItem + acrescimo, item.observacoes ?? null]
        );
        if (pizzaSnapshot) await client.query(`insert into itens_pedido_pizza (item_pedido_id, estabelecimento_id, tamanho_nome, sabor_um_nome, sabor_dois_nome, regra_meio_a_meio, preco_calculado) values ($1,$2,$3,$4,$5,$6,$7)`, [itensCriados[0].id, sessao.estabelecimentoId, pizzaSnapshot.tamanhoNome, pizzaSnapshot.saborUmNome, pizzaSnapshot.saborDoisNome, pizzaSnapshot.regraMeioAMeio, precoPizza]);
        for (const opcao of opcoes) {
          await client.query(
            `insert into itens_pedido_opcoes (estabelecimento_id, item_pedido_id, grupo_nome, opcao_nome, acrescimo)
             values ($1, $2, $3, $4, $5)`,
            [sessao.estabelecimentoId, itensCriados[0].id, opcao.grupoNome, opcao.nome, opcao.acrescimo]
          );
        }
      }

      if (tipo === "delivery") {
        await client.query(`insert into entregas (pedido_id, endereco, bairro) values ($1, $2, $3)`, [pedidoId, endereco, bairroNome]);
      }

      if (tipo !== "mesa" && formaPagamento === "dinheiro" && trocoPara > 0) {
        const { rows: totais } = await client.query<{ total: string }>(`select total from pedidos where id = $1`, [pedidoId]);
        if (trocoPara < Number(totais[0]?.total)) throw Object.assign(new Error(`O troco precisa ser para um valor igual ou maior que o total do pedido (R$ ${Number(totais[0]?.total).toFixed(2).replace(".", ",")}).`), { status: 400 });
      }
      await client.query(`select fn_comprometer_estoque_pedido($1, 'comprometido')`, [pedidoId]);
      if (modalidade === "imediata" && !pixAutomatico) await client.query(`select fn_consumir_estoque_pedido($1)`, [pedidoId]);
      await client.query(
        `insert into pedidos_idempotencia (estabelecimento_id, chave, hash_conteudo, pedido_id) values ($1, $2, $3, $4)`,
        [sessao.estabelecimentoId, chaveIdempotencia, hashConteudo, pedidoId]
      );
      return { pedidoId, repetido: false, pixAutomatico };
    });

    let cobranca: { copiaCola?: string; qrCodeBase64?: string; ticketUrl?: string; expiraEm?: string } | null = null;
    if (criado.pixAutomatico) {
      try {
        cobranca = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
          const { rows: existente } = await client.query<{ copiaCola: string | null; qrCodeBase64: string | null; ticketUrl: string | null; expiraEm: Date | null }>(
            `select copia_cola as "copiaCola", qr_code_base64 as "qrCodeBase64", ticket_url as "ticketUrl", expira_em as "expiraEm"
               from pagamentos_pix where pedido_id = $1`, [criado.pedidoId]
          );
          if (existente[0]?.copiaCola && existente[0]?.qrCodeBase64) return {
            copiaCola: existente[0].copiaCola,
            qrCodeBase64: existente[0].qrCodeBase64,
            ticketUrl: existente[0].ticketUrl ?? undefined,
            expiraEm: existente[0].expiraEm?.toISOString(),
          };

          const { rows: configuracoes } = await client.query<{ expiracaoMinutos: number }>(
            `select expiracao_minutos as "expiracaoMinutos" from configuracoes_pix
              where estabelecimento_id = $1 and ativo and modo = 'mercado_pago'`, [sessao.estabelecimentoId]
          );
          const configuracao = configuracoes[0];
          if (!configuracao) throw new MercadoPagoErro("Ative o Pix automático do Mercado Pago em Configurações antes de gerar o QR Code.", 409);
          const { rows: pedidos } = await client.query<{ total: number }>(`select total from pedidos where id = $1 and enviado_cozinha = false and pagamento_status = 'pendente'`, [criado.pedidoId]);
          if (!pedidos[0]) throw new MercadoPagoErro("Este pedido já não está aguardando pagamento.", 409);
          const idempotencyKey = randomUUID();
          const expiraEm = new Date(Date.now() + configuracao.expiracaoMinutos * 60_000);
          await client.query(
            `insert into pagamentos_pix (estabelecimento_id, pedido_id, provedor, idempotency_key, valor, expira_em)
             values ($1, $2, 'mercado_pago', $3::uuid, $4, $5)`,
            [sessao.estabelecimentoId, criado.pedidoId, idempotencyKey, pedidos[0].total, expiraEm]
          );
          const resultado = await criarCobrancaPixMercadoPago(await accessTokenDoEstabelecimento(client, sessao.estabelecimentoId), {
            pedidoId: criado.pedidoId, valor: Number(pedidos[0].total), email: emailTecnicoPix(), expiraEm, idempotencyKey,
          });
          const pagamento = resultado.pagamento;
          await client.query(
            `update pagamentos_pix set order_id = $2, payment_id = $3, copia_cola = $4, qr_code_base64 = $5, ticket_url = $6 where pedido_id = $1`,
            [criado.pedidoId, resultado.ordem.id, pagamento.id ?? null, pagamento.payment_method?.qr_code ?? null, pagamento.payment_method?.qr_code_base64 ?? null, pagamento.payment_method?.ticket_url ?? null]
          );
          return { copiaCola: pagamento.payment_method?.qr_code, qrCodeBase64: pagamento.payment_method?.qr_code_base64, ticketUrl: pagamento.payment_method?.ticket_url, expiraEm: expiraEm.toISOString() };
        });
      } catch (erro) {
        await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
          await client.query(`update pedidos set pagamento_status = 'falhou' where id = $1 and enviado_cozinha = false and pagamento_status = 'pendente'`, [criado.pedidoId]);
          await client.query(`select fn_liberar_estoque_pedido($1::uuid)`, [criado.pedidoId]);
        }).catch(() => undefined);
        const status = erro instanceof MercadoPagoErro ? erro.status : 502;
        return NextResponse.json({ erro: erro instanceof MercadoPagoErro ? erro.message : "Não foi possível gerar o Pix. Tente novamente." }, { status });
      }
    }

    const [pedido] = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
      const { rows } = await client.query(`${PEDIDOS_ATIVOS_QUERY} where p.id = $1`, [criado.pedidoId]);
      return rows;
    });

    return NextResponse.json({ ...pedido, cobranca }, { status: criado.repetido ? 200 : 201 });
  } catch (erro) {
    const status = (erro as { status?: number }).status ?? 500;
    if (status === 500) console.error("POST /api/pedidos", erro);
    const mensagem = status === 400 || status === 409 ? (erro as Error).message : "Não foi possível criar o pedido.";
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
