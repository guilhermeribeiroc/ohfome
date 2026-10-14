"use client";

import { useState } from "react";
import { KeyRound, Plus, Power, Save, ShieldCheck, Truck, UserRound, UsersRound, X } from "lucide-react";
import { MODULOS } from "@/lib/tenant-types";
import type { PapelUsuario } from "@/lib/tenant-types";
import { usePolling } from "@/lib/use-polling";
import { useTenant } from "@/lib/tenant-context";
import type { Entregador } from "@/lib/types";

interface UsuarioEquipe {
  id: string;
  nome: string;
  usuario: string;
  role: PapelUsuario;
  ativo: boolean;
  createdAt: string;
}

const USUARIO_REGEX = /^[a-z0-9][a-z0-9._-]{2,39}$/;
type RascunhoUsuario = { nome: string; usuario: string; senha: string; role: PapelUsuario | "" };
type RascunhoEntregador = { nome: string; veiculo: string; telefone: string };

function labelCargo(role: PapelUsuario) {
  if (role === "admin") return "Administrador";
  return MODULOS.find((modulo) => modulo.papel === role)?.label ?? role;
}

export function EquipeModule() {
  const { dados, setDados } = usePolling<UsuarioEquipe[]>("/api/usuarios", 60000);
  const { dados: entregadores, setDados: setEntregadores } = usePolling<Entregador[]>("/api/entregadores", 30000);
  const { estabelecimento } = useTenant();
  const [novoUsuarioAberto, setNovoUsuarioAberto] = useState(false);
  const [novoEntregadorAberto, setNovoEntregadorAberto] = useState(false);
  const [rascunhoUsuario, setRascunhoUsuario] = useState<RascunhoUsuario>({ nome: "", usuario: "", senha: "", role: "" });
  const [rascunhoEntregador, setRascunhoEntregador] = useState<RascunhoEntregador>({ nome: "", veiculo: "", telefone: "" });
  const [erroUsuario, setErroUsuario] = useState("");
  const [erroEntregador, setErroEntregador] = useState("");

  const cargos = MODULOS.filter((modulo) => estabelecimento?.modulosAtivos.includes(modulo.id));
  const usuarios = dados ?? [];

  return (
    <section className="of-page">
      <header className="of-page-header">
        <div><p className="of-eyebrow">Administração</p><h1 className="of-title">Equipe</h1><p className="of-subtitle">Crie os acessos da sua equipe e defina o que cada pessoa pode operar.</p></div>
      </header>

      <section className="of-panel overflow-hidden">
        <header className="of-panel-header"><div><h2 className="font-display text-lg font-bold text-ink-900">Acessos cadastrados</h2><p className="mt-0.5 text-xs text-ink-400">{usuarios.length} {usuarios.length === 1 ? "usuário" : "usuários"} neste estabelecimento.</p></div><div className="flex items-center gap-2"><span className="hidden h-10 w-10 items-center justify-center rounded-xl bg-basil-050 text-basil-600 sm:flex"><UsersRound size={19} /></span><button onClick={() => setNovoUsuarioAberto(true)} className="of-btn-primary"><Plus size={16} />Novo usuário</button></div></header>
        {erroUsuario && <p role="alert" className="border-b border-danger-100 bg-danger-050 px-4 py-3 text-xs font-medium text-danger-700">{erroUsuario}</p>}
        <div className="divide-y divide-cream-200">{usuarios.map((conta) => <UsuarioLinha key={conta.id} conta={conta} cargos={cargos.map((cargo) => cargo.papel)} onAtualizado={(atualizado) => setDados((atual) => (atual ?? []).map((item) => item.id === atualizado.id ? atualizado : item))} onFalha={setErroUsuario} />)}</div>
        {!usuarios.length && <div className="p-10 text-center text-sm text-ink-400">Carregando equipe…</div>}
      </section>

      <section className="of-panel mt-5 overflow-hidden">
        <header className="of-panel-header"><div><h2 className="font-display text-lg font-bold text-ink-900">Entregadores</h2><p className="mt-0.5 text-xs text-ink-400">{(entregadores ?? []).filter((entregador) => entregador.ativo !== false).length} entregador(es) ativo(s). Não cria login nem senha.</p></div><div className="flex items-center gap-2"><span className="hidden h-10 w-10 items-center justify-center rounded-xl bg-basil-050 text-basil-600 sm:flex"><Truck size={19} /></span><button onClick={() => setNovoEntregadorAberto(true)} className="of-btn-primary"><Plus size={16} />Novo entregador</button></div></header>
        <div className="divide-y divide-cream-200">{(entregadores ?? []).map((entregador) => <EntregadorLinha key={entregador.id} entregador={entregador} onAtualizado={(atualizado) => setEntregadores((atual) => (atual ?? []).map((item) => item.id === atualizado.id ? atualizado : item))} onExcluido={(id) => setEntregadores((atual) => (atual ?? []).filter((item) => item.id !== id))} onFalha={setErroEntregador} />)}</div>
        {erroEntregador && <p role="alert" className="border-t border-danger-100 bg-danger-050 px-4 py-3 text-xs font-medium text-danger-700">{erroEntregador}</p>}
        {!(entregadores ?? []).length && <div className="p-10 text-center text-sm text-ink-400">Nenhum entregador cadastrado ainda.</div>}
      </section>

      {novoUsuarioAberto && <NovoUsuarioModal cargos={cargos.map((cargo) => cargo.papel)} rascunho={rascunhoUsuario} onAlterar={setRascunhoUsuario} onFechar={() => setNovoUsuarioAberto(false)} onCriado={(criado) => { setDados((atual) => [...(atual ?? []), criado]); setRascunhoUsuario({ nome: "", usuario: "", senha: "", role: "" }); setNovoUsuarioAberto(false); }} />}
      {novoEntregadorAberto && <NovoEntregadorModal rascunho={rascunhoEntregador} onAlterar={setRascunhoEntregador} onFechar={() => setNovoEntregadorAberto(false)} onCriado={(criado) => { setEntregadores((atual) => [...(atual ?? []), criado]); setRascunhoEntregador({ nome: "", veiculo: "", telefone: "" }); setNovoEntregadorAberto(false); }} />}
    </section>
  );
}

function NovoUsuarioModal({ cargos, rascunho, onAlterar, onFechar, onCriado }: { cargos: PapelUsuario[]; rascunho: RascunhoUsuario; onAlterar: (rascunho: RascunhoUsuario) => void; onFechar: () => void; onCriado: (usuario: UsuarioEquipe) => void }) {
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  function atualizar(campo: keyof RascunhoUsuario, valor: string) {
    onAlterar({ ...rascunho, [campo]: campo === "usuario" ? valor.toLowerCase() : valor } as RascunhoUsuario);
  }

  async function criar() {
    setErro("");
    if (rascunho.nome.trim().length < 2 || !USUARIO_REGEX.test(rascunho.usuario) || rascunho.senha.length < 6 || !rascunho.role) {
      setErro("Preencha nome, usuário válido, senha de ao menos 6 caracteres e cargo.");
      return;
    }
    setEnviando(true);
    const resposta = await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rascunho) });
    const dadosResposta = await resposta.json().catch(() => null);
    setEnviando(false);
    if (!resposta.ok) { setErro(dadosResposta?.erro ?? "Não foi possível criar o usuário."); return; }
    onCriado(dadosResposta as UsuarioEquipe);
  }

  return <div className="of-modal-backdrop z-[70]" role="dialog" aria-modal="true" aria-label="Cadastrar usuário">
    <section className="of-modal-panel of-modal-scroll max-w-lg p-5">
      <header className="mb-5 flex items-start justify-between gap-3"><div><p className="of-eyebrow">Equipe</p><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Novo usuário</h2><p className="mt-1 text-xs text-ink-500">Cada pessoa entra com usuário e senha próprios.</p></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button></header>
      <div className="grid gap-3 sm:grid-cols-2"><label><span className="of-label">Nome</span><input value={rascunho.nome} onChange={(evento) => atualizar("nome", evento.target.value)} className="of-field" placeholder="Ex.: Maria Souza" autoFocus /></label><label><span className="of-label">Usuário</span><input value={rascunho.usuario} onChange={(evento) => atualizar("usuario", evento.target.value)} className="of-field" placeholder="Ex.: maria.casa" autoComplete="username" /></label><label><span className="of-label">Senha inicial</span><input type="password" value={rascunho.senha} onChange={(evento) => atualizar("senha", evento.target.value)} className="of-field" placeholder="Mínimo de 6 caracteres" autoComplete="new-password" /></label><label><span className="of-label">Cargo</span><select value={rascunho.role} onChange={(evento) => atualizar("role", evento.target.value)} className="of-field"><option value="">Selecione</option>{cargos.map((cargo) => <option key={cargo} value={cargo}>{labelCargo(cargo)}</option>)}</select></label></div>
      {erro && <p role="alert" className="mt-4 rounded-xl bg-danger-050 px-3 py-2 text-xs font-medium text-danger-700">{erro}</p>}
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-4"><p className="text-xs text-ink-400">A senha pode ser redefinida depois.</p><button onClick={() => void criar()} disabled={enviando} className="of-btn-primary">{enviando ? "Criando..." : "Criar usuário"}<Plus size={16} /></button></footer>
    </section>
  </div>;
}

function NovoEntregadorModal({ rascunho, onAlterar, onFechar, onCriado }: { rascunho: RascunhoEntregador; onAlterar: (rascunho: RascunhoEntregador) => void; onFechar: () => void; onCriado: (entregador: Entregador) => void }) {
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  function atualizar(campo: keyof RascunhoEntregador, valor: string) {
    onAlterar({ ...rascunho, [campo]: valor });
  }

  async function criar() {
    if (rascunho.nome.trim().length < 2) { setErro("Informe o nome do entregador."); return; }
    setEnviando(true); setErro("");
    const resposta = await fetch("/api/entregadores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rascunho) });
    const dadosResposta = await resposta.json().catch(() => null);
    setEnviando(false);
    if (!resposta.ok) { setErro(dadosResposta?.erro ?? "Não foi possível cadastrar o entregador."); return; }
    onCriado(dadosResposta as Entregador);
  }

  return <div className="of-modal-backdrop z-[70]" role="dialog" aria-modal="true" aria-label="Cadastrar entregador">
    <section className="of-modal-panel of-modal-scroll max-w-md p-5">
      <header className="mb-5 flex items-start justify-between gap-3"><div><p className="of-eyebrow">Equipe</p><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Novo entregador</h2><p className="mt-1 text-xs text-ink-500">Cadastro para despacho, sem criar login ou senha.</p></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button></header>
      <div className="space-y-3"><label className="block"><span className="of-label">Nome</span><input value={rascunho.nome} onChange={(evento) => atualizar("nome", evento.target.value)} className="of-field" placeholder="Ex.: João da Moto" autoFocus /></label><label className="block"><span className="of-label">Veículo</span><input value={rascunho.veiculo} onChange={(evento) => atualizar("veiculo", evento.target.value)} className="of-field" placeholder="Ex.: Moto" /></label><label className="block"><span className="of-label">Telefone</span><input value={rascunho.telefone} onChange={(evento) => atualizar("telefone", evento.target.value)} className="of-field" inputMode="tel" placeholder="Opcional" /></label></div>
      {erro && <p role="alert" className="mt-4 rounded-xl bg-danger-050 px-3 py-2 text-xs font-medium text-danger-700">{erro}</p>}
      <footer className="mt-5 flex justify-end border-t border-cream-200 pt-4"><button onClick={() => void criar()} disabled={enviando} className="of-btn-primary">{enviando ? "Cadastrando..." : "Cadastrar entregador"}<Plus size={16} /></button></footer>
    </section>
  </div>;
}

function EntregadorLinha({ entregador, onAtualizado, onExcluido, onFalha }: { entregador: Entregador; onAtualizado: (entregador: Entregador) => void; onExcluido: (id: string) => void; onFalha: (erro: string) => void }) {
  const [nome, setNome] = useState(entregador.nome);
  const [veiculo, setVeiculo] = useState(entregador.veiculo ?? "");
  const [telefone, setTelefone] = useState(entregador.telefone ?? "");
  const [salvando, setSalvando] = useState(false);

  async function atualizar(campos: Record<string, unknown>) {
    setSalvando(true);
    const resposta = await fetch(`/api/entregadores/${entregador.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(campos) });
    setSalvando(false);
    if (!resposta.ok) {
      const dadosErro = await resposta.json().catch(() => null);
      onFalha(dadosErro?.erro ?? "Não foi possível atualizar o entregador.");
      return;
    }
    onAtualizado(await resposta.json() as Entregador);
  }

  async function excluir() {
    if (!confirm(`Remover "${entregador.nome}" da equipe de entrega?`)) return;
    setSalvando(true);
    const resposta = await fetch(`/api/entregadores/${entregador.id}`, { method: "DELETE" });
    setSalvando(false);
    if (!resposta.ok) {
      const dadosErro = await resposta.json().catch(() => null);
      onFalha(dadosErro?.erro ?? "Não foi possível remover o entregador.");
      return;
    }
    onExcluido(entregador.id);
  }

  return <details className="group px-4 py-3.5"><summary className="flex cursor-pointer list-none items-center gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${entregador.ativo !== false ? "bg-cream-100 text-ink-700" : "bg-danger-050 text-danger-600"}`}><Truck size={18} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{entregador.nome}</p><p className="mt-0.5 text-xs text-ink-400">{entregador.veiculo || "Sem veículo"}{entregador.telefone ? ` · ${entregador.telefone}` : ""}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${entregador.ativo !== false ? "bg-basil-050 text-basil-700" : "bg-danger-050 text-danger-600"}`}>{entregador.ativo !== false ? "Ativo" : "Desativado"}</span></summary>
    <div className="mt-4 grid gap-3 rounded-2xl bg-cream-50 p-3.5 sm:grid-cols-3"><label><span className="of-label">Nome</span><input value={nome} onChange={(evento) => setNome(evento.target.value)} className="of-field !bg-surface" /></label><label><span className="of-label">Veículo</span><input value={veiculo} onChange={(evento) => setVeiculo(evento.target.value)} className="of-field !bg-surface" /></label><label><span className="of-label">Telefone</span><input value={telefone} onChange={(evento) => setTelefone(evento.target.value)} className="of-field !bg-surface" /></label></div>
    <div className="mt-3 flex flex-wrap justify-end gap-2"><button onClick={() => void atualizar({ nome, veiculo, telefone })} disabled={salvando} className="of-btn-secondary"><Save size={15} />Salvar</button><button onClick={() => void atualizar({ ativo: entregador.ativo === false })} disabled={salvando} className={entregador.ativo !== false ? "of-btn-secondary !text-danger-600" : "of-btn-secondary !text-basil-700"}><Power size={15} />{entregador.ativo !== false ? "Desativar" : "Reativar"}</button><button onClick={() => void excluir()} disabled={salvando} className="of-btn-secondary !text-danger-600"><X size={15} />Excluir</button></div>
  </details>;
}

function UsuarioLinha({ conta, cargos, onAtualizado, onFalha }: { conta: UsuarioEquipe; cargos: PapelUsuario[]; onAtualizado: (conta: UsuarioEquipe) => void; onFalha: (erro: string) => void }) {
  const [nome, setNome] = useState(conta.nome);
  const [usuario, setUsuario] = useState(conta.usuario);
  const [role, setRole] = useState<PapelUsuario>(conta.role);
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function atualizar(campos: Record<string, unknown>) {
    setSalvando(true);
    const resposta = await fetch(`/api/usuarios/${conta.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(campos) });
    setSalvando(false);
    if (!resposta.ok) {
      const dadosErro = await resposta.json().catch(() => null);
      onFalha(dadosErro?.erro ?? "Não foi possível atualizar o usuário.");
      return;
    }
    const atualizado = await resposta.json() as UsuarioEquipe;
    onAtualizado(atualizado);
    setSenha("");
  }

  return <details className="group px-4 py-3.5"><summary className="flex cursor-pointer list-none items-center gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${conta.ativo ? "bg-cream-100 text-ink-700" : "bg-danger-050 text-danger-600"}`}>{conta.role === "admin" ? <ShieldCheck size={18} /> : <UserRound size={18} />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{conta.nome}</p><p className="mt-0.5 text-xs text-ink-400">@{conta.usuario} · {labelCargo(conta.role)}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${conta.ativo ? "bg-basil-050 text-basil-700" : "bg-danger-050 text-danger-600"}`}>{conta.ativo ? "Ativo" : "Desativado"}</span></summary>
    <div className="mt-4 grid gap-3 rounded-2xl bg-cream-50 p-3.5 sm:grid-cols-2 lg:grid-cols-4"><label><span className="of-label">Nome</span><input value={nome} onChange={(evento) => setNome(evento.target.value)} className="of-field !bg-surface" /></label><label><span className="of-label">Usuário</span><input value={usuario} onChange={(evento) => setUsuario(evento.target.value.toLowerCase())} className="of-field !bg-surface" /></label>{conta.role === "admin" ? <div className="flex items-end pb-0.5 text-xs leading-5 text-ink-500">A conta administradora mantém acesso total.</div> : <label><span className="of-label">Cargo</span><select value={role} onChange={(evento) => setRole(evento.target.value as PapelUsuario)} className="of-field !bg-surface">{cargos.map((cargo) => <option key={cargo} value={cargo}>{labelCargo(cargo)}</option>)}</select></label>}<label><span className="of-label">Nova senha</span><input type="password" value={senha} onChange={(evento) => setSenha(evento.target.value)} placeholder="Deixe em branco para manter" className="of-field !bg-surface" autoComplete="new-password" /></label></div>
    <div className="mt-3 flex flex-wrap justify-end gap-2"><button onClick={() => void atualizar({ nome, usuario, ...(conta.role === "admin" ? {} : { role }), ...(senha ? { senha } : {}) })} disabled={salvando} className="of-btn-secondary"><Save size={15} />Salvar</button>{conta.role !== "admin" && <button onClick={() => void atualizar({ ativo: !conta.ativo })} disabled={salvando} className={conta.ativo ? "of-btn-secondary !text-danger-600" : "of-btn-secondary !text-basil-700"}><Power size={15} />{conta.ativo ? "Desativar" : "Reativar"}</button>}{senha && <span className="flex items-center gap-1 self-center text-xs text-basil-700"><KeyRound size={13} />Senha será atualizada</span>}</div>
  </details>;
}
