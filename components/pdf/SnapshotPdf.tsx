import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { SharedSnapshot, StudySnapshot, AnnotationSnapshot } from '@/lib/shared-studies';

// Documento PDF do snapshot compartilhado (estudo ou anotação).
//
// Fonte: DejaVu Sans (CDN), registrada como família única para regular + bold.
// Diferente da Helvetica embutida (só Latin/WinAnsi), o DejaVu Sans cobre Latin,
// Grego e Hebraico — essencial num app de grego/hebraico, onde corpos de anotação
// e mensagens trazem essas escritas. A fonte é baixada uma vez por processo e
// cacheada pelo @react-pdf. Limitação: o Hebraico renderiza com glifos corretos,
// mas sem reordenação RTL completa (a leitura web cuida do RTL).
Font.register({
  family: 'DejaVu',
  fonts: [
    { src: 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf' },
    { src: 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf', fontWeight: 'bold' },
  ],
});
// Não quebra palavras longas (transliterações, lemas) com hífen automático.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: { paddingVertical: 48, paddingHorizontal: 48, fontFamily: 'DejaVu', color: '#1f2937' },
  brand: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  meta: { fontSize: 9, color: '#9ca3af', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  prompt: { fontSize: 10, color: '#4b5563', backgroundColor: '#f3f4f6', padding: 8, borderRadius: 4, marginBottom: 12 },
  sectionTitle: { fontSize: 9, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginTop: 16, marginBottom: 6 },
  body: { fontSize: 11, lineHeight: 1.5, marginBottom: 8 },
  chip: { fontSize: 10, color: '#92400e', marginRight: 8, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  sourceItem: { fontSize: 10, color: '#4b5563', marginBottom: 3 },
  msgUser: { fontSize: 11, lineHeight: 1.5, backgroundColor: '#fef3c7', padding: 8, borderRadius: 4, marginBottom: 8 },
  msgAssistant: { fontSize: 11, lineHeight: 1.5, backgroundColor: '#f3f4f6', padding: 8, borderRadius: 4, marginBottom: 8 },
  msgRole: { fontSize: 8, fontWeight: 'bold', color: '#9ca3af', marginBottom: 2 },
  footer: { position: 'absolute', bottom: 24, left: 48, right: 48, fontSize: 8, color: '#9ca3af', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 6 },
});

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

function StudyBody({ s }: { s: StudySnapshot }) {
  const ref = s.reference ? ` · ${s.reference.bookName} ${s.reference.chapter}` : '';
  return (
    <View>
      <Text style={styles.meta}>
        {s.modeLabel}
        {ref}
      </Text>
      <Text style={styles.title}>{s.title}</Text>

      {s.prompt ? <Text style={styles.prompt}>Orientação: {s.prompt}</Text> : null}
      {s.legacyContent ? <Text style={styles.body}>{s.legacyContent}</Text> : null}

      {s.references.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Passagens citadas</Text>
          <View style={styles.chipRow}>
            {s.references.map((r) => (
              <Text key={r.ref} style={styles.chip}>
                {r.ref}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {s.sources.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Fontes</Text>
          {s.sources.map((src, i) => (
            <Text key={`${src.kind}-${i}`} style={styles.sourceItem}>
              • {src.title}
            </Text>
          ))}
        </View>
      ) : null}

      {s.messages.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Conversa</Text>
          {s.messages.map((m, i) => (
            <View key={i} style={m.role === 'user' ? styles.msgUser : styles.msgAssistant}>
              <Text style={styles.msgRole}>{m.role === 'user' ? 'VOCÊ' : 'IA'}</Text>
              <Text>{m.content}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AnnotationBody({ s }: { s: AnnotationSnapshot }) {
  return (
    <View>
      <Text style={styles.meta}>Anotação</Text>
      <Text style={styles.title}>{s.title}</Text>
      <Text style={styles.body}>{s.body}</Text>

      {s.crossRefs.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Referências relacionadas</Text>
          <View style={styles.chipRow}>
            {s.crossRefs.map((r) => (
              <Text key={r.ref} style={styles.chip}>
                {r.ref}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function SnapshotPdf({ snapshot, snapshotAt }: { snapshot: SharedSnapshot; snapshotAt: string }) {
  return (
    <Document title={snapshot.title} author="Hermeneus">
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>Hermeneus</Text>
        {snapshot.kind === 'study' ? <StudyBody s={snapshot} /> : <AnnotationBody s={snapshot} />}
        <Text style={styles.footer} fixed>
          Compartilhado de Hermeneus · snapshot de {dateFmt.format(new Date(snapshotAt))}
        </Text>
      </Page>
    </Document>
  );
}
