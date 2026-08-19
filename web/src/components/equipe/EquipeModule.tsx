"use client";

import { useState } from "react";
import { KeyRound, Plus, Power, Save, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { MODULOS } from "@/lib/tenant-types";
import type { PapelUsuario } from "@/lib/tenant-types";
import { usePolling } from "@/lib/use-polling";
import { useTenant } from "@/lib/tenant-context";

interface UsuarioEquipe {
  id: string;
  nome: string;
  usuario: string;
  role: PapelUsuario;
  ativo: boolean;
  createdAt: string;
}

const USUARIO_REGEX = /^[a-z0-9][a-z0-9._-]{2,39}$/;

function labelCargo(role: PapelUsuario) {
  if (role === "admin") return "Administrador";
  return MODULOS.find((modulo) => modulo.papel === role)?.label ?? role;
}

export function EquipeModule() {
  const { dados, setDados } = usePolling<UsuarioEquipe[]>("/api/usuarios", 60000);
  const { estabelecimento } = useTenant();
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState<PapelUsuario | "">("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargos = MODULOS.filter((modulo) => estabelecimento?.modulosAtivos.includes(modulo.id));
  const usuarios = dados ?? [];

  async function criarUsuario() {
    setErro("");
    if (nome.trim().length < 2 || !USUARIO_REGEX.test(usuario) || senha.length < 6 || !role) {
      setErro("Preencha nome, usuário válido, senha de ao menos 6 caracteres e cargo.");
      return;
    }
    setEnviando(true);
    const resposta = await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, usuario, senha, role }) });
    setEnviando(false);
    if (!resposta.ok) {
      const dadosErro = await resposta.json().catch(() => null);
      setErro(dadosErro?.erro ?? "Não foi possível criar o usuário.");
      return;
    }
    const criado = await resposta.json() as UsuarioEquipe;
    setDados((atual) => [...(atual ?? []), criado]);
    setNome(""); setUsuario(""); setSenha(""); setRole("");
  }

  return (
    <section className="of-page">
      <header className="of-page-header">
        <div><p className="of-eyebrow">Administração</p><h1 className="of-title">Equipe</h1><p className="of-subtitle">Crie os acessos da sua equipe e defina o que cada pessoa pode operar.</p></div>
      </header>

      <section className="of-panel mb-5 overflow-hidden">
        <header className="of-panel-header"><div><h2 className="font-display text-lg font-bold text-ink-900">Novo usuário</h2><p className="mt-0.5 text-xs text-ink-400">Cada pessoa entra com usuário e senha próprios.</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral-050 text-coral-600"><Plus size={19} /></span></header>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className="of-label">Nome</span><input value={nome} onChange={(evento) => setNome(evento.target.value)} className="of-field" placeholder="Ex.: Maria Souza" /></label>
          <label><span className="of-label">Usuário</span><input value={usuario} onChange={(evento) => setUsuario(evento.target.value.toLowerCase())} className="of-field" placeholder="Ex.: maria.casa" autoComplete="username" /></label>
          <label><span className="of-label">Senha inicial</span><input type="password" value={senha} onChange={(evento) => setSenha(evento.target.value)} className="of-field" placeholder="Mínimo de 6 caracteres" autoComplete="new-password" /></label>
          <label><span className="of-label">Cargo</span><select value={role} onChange={(evento) => setRole(evento.target.value as PapelUsuario)} className="of-field"><option value="">Selecione</option>{cargos.map((cargo) => <option key={cargo.papel} value={cargo.papel}>{cargo.label}</option>)}</select></label>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 bg-cream-50/50 p-4">{erro ? <p role="alert" className="text-xs font-medium text-danger-600">{erro}</p> : <p className="text-xs text-ink-400">Usuários podem ser desativados ou ter a senha redefinida depois.</p>}<button onClick={() => void criarUsuario()} disabled={enviando} className="of-btn-primary">{enviando ? "Criando..." : "Criar usuário"}<Plus size={16} /></button></footer>
      </section>

      <section className="of-panel overflow-hidden">
        <header className="of-panel-header"><div><h2 className="font-display text-lg font-bold text-ink-900">Acessos cadastrados</h2><p className="mt-0.5 text-xs text-ink-400">{usuarios.length} {usuarios.length === 1 ? "usuário" : "usuários"} neste estabelecimento.</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-basil-050 text-basil-600"><UsersRound size={19} /></span></header>
        <div className="divide-y divide-cream-200">{usuarios.map((conta) => <UsuarioLinha key={conta.id} conta={conta} cargos={cargos.map((cargo) => cargo.papel)} onAtualizado={(atualizado) => setDados((atual) => (atual ?? []).map((item) => item.id === atualizado.id ? atualizado : item))} onFalha={setErro} />)}</div>
        {!usuarios.length && <div className="p-10 text-center text-sm text-ink-400">Carregando equipe…</div>}
      </section>
    </section>
  );
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
