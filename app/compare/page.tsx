import { redirect } from 'next/navigation';

// O comparador é sempre escopado a um capítulo. A entrada `/compare` redireciona
// para um capítulo inicial sensato (João 1) — texto clássico para iniciantes.
export default function CompareIndexPage() {
  redirect('/compare/John/1');
}
