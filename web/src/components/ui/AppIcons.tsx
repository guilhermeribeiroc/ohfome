import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Beef,
  Bike,
  CakeSlice,
  ChefHat,
  ClipboardList,
  Coffee,
  CookingPot,
  Croissant,
  Flame,
  Fish,
  Hamburger,
  IceCreamCone,
  PackageOpen,
  Pizza,
  Sandwich,
  Soup,
  Store,
  TabletSmartphone,
  UtensilsCrossed,
  WalletCards,
  Warehouse,
} from "lucide-react";
import type { ModuloNavegacao, TipoEstabelecimento } from "@/lib/tenant-types";

const MODULO_ICONS: Record<ModuloNavegacao, LucideIcon> = {
  financeiro: WalletCards,
  balcao: ClipboardList,
  cozinha: ChefHat,
  garcom: UtensilsCrossed,
  estoque: Warehouse,
  delivery: Bike,
  site: TabletSmartphone,
};

const SEGMENTO_ICONS: Record<TipoEstabelecimento, LucideIcon> = {
  churrascaria: Flame,
  pizzaria: Pizza,
  hamburgueria: Hamburger,
  japonesa: Fish,
  padaria_cafeteria: Croissant,
  sorveteria: IceCreamCone,
  outro: Store,
};

const CATEGORY_ICONS: Array<[RegExp, LucideIcon]> = [
  [/pizza/i, Pizza],
  [/burger|hamb|lanche/i, Hamburger],
  [/bebida|suco|refri|drink/i, Coffee],
  [/sobremesa|doce|chocolate|bolo/i, CakeSlice],
  [/carne|churrasco|espeto|picanha/i, Beef],
  [/sushi|temaki|japon/i, Fish],
  [/sorvete|açaí|acai|milk-?shake|sundae|casquinha|gelato/i, IceCreamCone],
  [/pão|padaria|salgado|croissant/i, Croissant],
  [/café|cafeteria/i, Coffee],
  [/sopa|caldo/i, Soup],
  [/combo|porção/i, PackageOpen],
  [/sanduíche/i, Sandwich],
];

export function ModuleIcon({ modulo, ...props }: { modulo: ModuloNavegacao } & LucideProps) {
  const Icon = MODULO_ICONS[modulo];
  return <Icon aria-hidden {...props} />;
}

export function SegmentIcon({ segmento, ...props }: { segmento: TipoEstabelecimento } & LucideProps) {
  const Icon = SEGMENTO_ICONS[segmento] ?? CookingPot;
  return <Icon aria-hidden {...props} />;
}

export function CategoryIcon({ categoria, ...props }: { categoria: string } & LucideProps) {
  const Icon = CATEGORY_ICONS.find(([regex]) => regex.test(categoria))?.[1] ?? UtensilsCrossed;
  return <Icon aria-hidden {...props} />;
}
