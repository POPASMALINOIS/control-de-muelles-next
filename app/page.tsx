// /app/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseExcelFile, type DockItem } from '@/lib/excel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/toaster';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

type DockMap = Record<number, DockItem | undefined>;
const MIN_DOCK = 312;
const MAX_DOCK = 370;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function estadoDe(c?: DockItem) {
  if (!c) return 'libre' as const;
  if (!c.salidaISO) return 'ocupado' as const;
  const diff = new Date(c.salidaISO).getTime() - Date.now();
  if (diff < 0) return 'retraso' as const;
  if (diff <= 30 * 60 * 1000) return 'alerta-30' as const;
  return 'ocupado' as const;
}
function claseEstado(e: ReturnType<typeof estadoDe>) {
  if (e === 'retraso') return 'bg-red-100 text-red-700';
  if (e === 'alerta-30') return 'bg-yellow-100 text-yellow-800';
  if (e === 'ocupado') return 'bg-blue-100 text-blue-700';
  return 'bg-green-100 text-green-700';
}
function fmt(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d as any)) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function KPIs({ data }: { data: DockMap }) {
  const muelles = range(MIN_DOCK, MAX_DOCK);
  let libres = 0, ocupados = 0, alerta = 0, retraso = 0, enHora = 0;
  for (const m of muelles) {
    const c = data[m];
    const e = estadoDe(c);
    if (e === 'libre') libres++;
    else {
      ocupados++;
      if (e === 'retraso') retraso++;
      else if (e === 'alerta-30') alerta++;
      else enHora++;
    }
  }
  const box = (label: string, value: number, cls: string) => (
    <div className={`px-3 py-2 rounded-lg text-sm font-medium text-white ${cls}`}>{label}: {value}</div>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-3">
      {box('Ocupados', ocupados, 'bg-blue-600')}
      {box('En hora', enHora, 'bg-green-600')}
      {box('Alertas', alerta, 'bg-yellow-600')}
      {box('Retrasos', retraso, 'bg-red-600')}
      {box('Libres', libres, 'bg-slate-500')}
    </div>
  );
}

function DockCard({ muelle, item }: { muelle: number; item?: DockItem }) {
  const e = estadoDe(item);
  const icon = e === 'retraso' ? '⛔' : e === 'alerta-30' ? '🕒' : e === 'ocupado' ? '📦' : '✅';
  return (
    <Card className="border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">Muelle {muelle}</CardTitle>
        <Badge className={claseEstado(e)}>{icon} {e}</Badge>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        {item ? (
          <>
            <div className="font-medium">{item.empresa || '—'}</div>
            <div className="text-muted-foreground">{item.carga || '—'}</div>
            <div>Llega: {fmt(item.llegadaISO)} · Límite: {fmt(item.salidaISO)}</div>
            <div>Mat.: {item.matricula || '—'}</div>
            <div>Estado: {item.estado || '—'}</div>
            {item.observaciones ? (
              <div className="text-xs text-muted-foreground">Obs.: {item.observaciones}</div>
            ) : null}
          </>
        ) : (
          <div className="opacity-60">Libre</div>
        )}
      </CardContent>
    </Card>
  );
}

/** Normaliza un mapa con TODOS los muelles del rango, incluyendo los vacíos */
function fullRangeMap(source: DockMap): DockMap {
  const out: DockMap = {};
  for (const m of range(MIN_DOCK, MAX_DOCK)) out[m] = source[m];
  return out;
}

/** Combina el mapa actual con lo importado sin perder muelles vacíos del rango */
function mergeImported(current: DockMap, imported: DockMap): DockMap {
  const out = fullRangeMap(current);
  for (const m of range(MIN_DOCK, MAX_DOCK)) {
    if (imported[m] !== undefined) out[m] = imported[m];
    if (out[m] === null as any) out[m] = undefined; // seguridad
  }
  return out;
}

export default function Page() {
  const muelles = useMemo(() => range(MIN_DOCK, MAX_DOCK), []);
  const [data, setData] = useState<DockMap>({});
  const [filtro, setFiltro] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Operativa (tabla editable)
  const [openOperativa, setOpenOperativa] = useState(false);
  const [operativaEdit, setOperativaEdit] = useState<DockMap>({});

  // guarda/lee de localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('muelles-data-v2');
      if (raw) setData(fullRangeMap(JSON.parse(raw)));
      else setData(fullRangeMap({}));
    } catch {
      setData(fullRangeMap({}));
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('muelles-data-v2', JSON.stringify(fullRangeMap(data)));
  }, [data]);

  // refresco visual para KPIs/estados
  useEffect(() => {
    const id = setInterval(() => setData(d => ({ ...d })), 60000);
    return () => clearInterval(id);
  }, []);

  const visibles = useMemo(() => {
    return muelles.filter((m) => {
      const c = data[m];
      if (soloAlertas) {
        const e = estadoDe(c);
        if (e !== 'alerta-30' && e !== 'retraso') return false;
      }
      if (!filtro) return true;
      return (c?.empresa || '').toLowerCase().includes(filtro.toLowerCase());
    });
  }, [muelles, data, filtro, soloAlertas]);

  async function onExcelChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const items = await parseExcelFile(file, 2); // encabezados en fila 3
      const imported: DockMap = {};
      for (const it of items) {
        if (it.muelle >= MIN_DOCK && it.muelle <= MAX_DOCK) imported[it.muelle] = it;
      }
      const merged = mergeImported(data, imported);
      setData(merged);
      toast({ title: 'Excel importado', description: `Se han importado ${Object.keys(imported).length} muelles.` });
    } catch (err: any) {
      toast({ title: 'Error leyendo Excel', description: String(err?.message || err), variant: 'destructive' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function limpiar() {
    if (confirm('¿Borrar datos locales?')) {
      const empty = fullRangeMap({});
      setData(empty);
      localStorage.removeItem('muelles-data-v2');
    }
  }

  // --------- Operativa (tabla editable) ----------
  function openOperativaDialog() {
    // Creamos una copia editable con todos los muelles del rango,
    // incluidos los vacíos (para ver/editar aunque no vinieran en el Excel).
    setOperativaEdit(fullRangeMap(data));
    setOpenOperativa(true);
  }

  function onEditField(muelle: number, field: keyof DockItem, value: string) {
    setOperativaEdit(prev => {
      const next = { ...prev };
      const base: DockItem = next[muelle] ?? { muelle, empresa: '', carga: '' };
      let updated: DockItem = { ...base };
      if (field === 'muelle') {
        // no editable, ignorar
        return prev;
      } else if (field === 'llegadaISO' || field === 'salidaISO') {
        // Permitimos HH:MM y guardamos directamente el string (parse ya lo hará la lógica de estado)
        // Para no complicar: si viene vacío, lo dejamos undefined.
        updated = { ...updated, [field]: value.trim() ? value : undefined };
      } else {
        updated = { ...updated, [field]: value };
      }
      next[muelle] = normalizeEmpty(updated);
      return next;
    });
  }

  function normalizeEmpty(item: DockItem): DockItem | undefined {
    // Si todos los campos (excepto muelle) están vacíos, lo consideramos "vacío"
    const { empresa, carga, matricula, estado, observaciones, llegadaISO, salidaISO } = item;
    const allEmpty =
      !empresa && !carga && !matricula && !estado && !observaciones && !llegadaISO && !salidaISO;
    return allEmpty ? undefined : item;
  }

  function aplicarOperativa() {
    // Aplicamos la edición sobre el estado principal y guardamos
    const merged = fullRangeMap(operativaEdit);
    setData(merged);
    setOpenOperativa(false);
    toast({ title: 'Operativa actualizada', description: 'Los cambios han sido aplicados.' });
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <Toaster />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Control de Muelles 312–370</h1>

        {/* Botón discreto para ver/editar operativa completa */}
        <Dialog open={openOperativa} onOpenChange={setOpenOperativa}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" onClick={openOperativaDialog}>
              Ver operativa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] w-[1100px]">
            <DialogHeader>
              <DialogTitle>Operativa cargada (editable)</DialogTitle>
            </DialogHeader>

            <ScrollArea className="h-[60vh] rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Muelle</TableHead>
                    <TableHead>Transportista</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead className="w-28">Llega (HH:MM)</TableHead>
                    <TableHead className="w-28">Salida/Tope (HH:MM)</TableHead>
                    <TableHead className="w-28">Matrícula</TableHead>
                    <TableHead className="w-28">Estado</TableHead>
                    <TableHead>Observaciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {muelles.map((m) => {
                    const row = operativaEdit[m];
                    return (
                      <TableRow key={m}>
                        <TableCell className="font-medium">{m}</TableCell>
                        <TableCell>
                          <Input
                            value={row?.empresa ?? ''}
                            placeholder=""
                            onChange={(e) => onEditField(m, 'empresa', e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row?.carga ?? ''}
                            placeholder=""
                            onChange={(e) => onEditField(m, 'carga', e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={hhmmFromISO(row?.llegadaISO)}
                            placeholder="08:30"
                            onChange={(e) => onEditField(m, 'llegadaISO', toISOFromHHMMLoose(e.target.value))}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={hhmmFromISO(row?.salidaISO)}
                            placeholder="10:00"
                            onChange={(e) => onEditField(m, 'salidaISO', toISOFromHHMMLoose(e.target.value))}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row?.matricula ?? ''}
                            placeholder=""
                            onChange={(e) => onEditField(m, 'matricula', e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row?.estado ?? ''}
                            placeholder=""
                            onChange={(e) => onEditField(m, 'estado', e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row?.observaciones ?? ''}
                            placeholder=""
                            onChange={(e) => onEditField(m, 'observaciones', e.target.value)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>

            <DialogFooter className="gap-2">
              <Button variant="secondary" onClick={() => setOpenOperativa(false)}>Cancelar</Button>
              <Button onClick={aplicarOperativa}>Aplicar cambios</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <KPIs data={data} />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filtrar por transportista"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="max-w-xs"
        />
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={soloAlertas}
            onChange={(e) => setSoloAlertas(e.target.checked)}
          />
          Solo alertas/retrasos
        </label>
        <Separator orientation="vertical" className="mx-2 h-6" />
        <Input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onExcelChange} className="max-w-sm" />
        <Button variant="secondary" onClick={limpiar}>Limpiar</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {visibles.map((m) => (
          <DockCard key={m} muelle={m} item={data[m]} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground py-6">
        SPA estática · Datos en localStorage · Importa Excel (encabezados en fila 3) · KPIs básicos · Tabla de operativa editable
      </p>
    </div>
  );
}

/** Helpers HH:MM ⇄ ISO (tolerante) */
function hhmmFromISO(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
function toISOFromHHMMLoose(hhmm: string) {
  const s = (hhmm ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const d = new Date();
  d.setHours(Number(m[1]) || 0, Number(m[2]) || 0, 0, 0);
  return d.toISOString();
}
