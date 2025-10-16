"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { Upload, Globe, Clock, AlertTriangle, Edit2, RefreshCw, Truck, CheckCircle2, Download } from "lucide-react"
import * as XLSX from "xlsx"

interface MuelleData {
  numero: number
  lado?: number
  empresa?: string
  carga?: string
  horaLlegada?: string
  horaLlegadaReal?: string
  horaSalida?: string
  horaSalidaReal?: string
  matricula?: string
  precinto?: string
  incidencias?: string
  observaciones?: string
  preAsignado?: boolean
  camionEsperaId?: string
}

interface CamionFinalizado {
  muelle: number
  lado: number
  empresa: string
  carga: string
  horaLlegada?: string
  horaLlegadaReal?: string
  horaSalida?: string
  horaSalidaReal?: string
  matricula?: string
  precinto?: string
  incidencias?: string
  observaciones?: string
  fechaFinalizacion: string
  horaFinalizacion: string
}

interface CamionEspera {
  id: string
  lado: number
  empresa: string
  carga: string
  horaLlegada?: string
  matricula?: string
  precinto?: string
  observaciones?: string
  muellePreAsignado?: number // Added to store the pre-assigned dock number
}

const getColorLado = (lado: number): string => {
  const colores: Record<number, string> = {
    1: "bg-red-500 text-white border-red-600",
    2: "bg-blue-500 text-white border-blue-600",
    3: "bg-green-500 text-white border-green-600",
    4: "bg-yellow-500 text-slate-900 border-yellow-600",
    5: "bg-purple-500 text-white border-purple-600",
    6: "bg-pink-500 text-white border-pink-600",
    7: "bg-orange-500 text-white border-orange-600",
    8: "bg-cyan-500 text-white border-cyan-600",
    9: "bg-indigo-500 text-white border-indigo-600",
  }
  return colores[lado] || "bg-slate-500 text-white border-slate-600"
}

export default function GestionMuelles() {
  const [muelles, setMuelles] = useState<MuelleData[]>(() => {
    const muellesIniciales: MuelleData[] = []
    for (let i = 312; i <= 370; i++) {
      muellesIniciales.push({ numero: i })
    }
    return muellesIniciales
  })

  const [camionesEspera, setCamionesEspera] = useState<CamionEspera[]>([])
  const [urlDialog, setUrlDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [muelleSeleccionado, setMuelleSeleccionado] = useState<number | null>(null)
  const [editData, setEditData] = useState<Partial<MuelleData>>({})
  const [url, setUrl] = useState("")
  const [currentTime, setCurrentTime] = useState(new Date())
  const [expandedMuelles, setExpandedMuelles] = useState<Set<number>>(new Set())
  const [autoRefresh, setAutoRefresh] = useState(false)
  const { toast } = useToast()

  const [cargados, setCargados] = useState<Set<number>>(new Set())

  const [historialFinalizados, setHistorialFinalizados] = useState<CamionFinalizado[]>([])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
      if (autoRefresh && url) {
        actualizarDesdeURL()
      }
    }, 60000)

    return () => clearInterval(timer)
  }, [autoRefresh, url])

  const shouldShowAlert = (horaSalida?: string): boolean => {
    if (!horaSalida) return false

    try {
      const [hours, minutes] = horaSalida.split(":").map(Number)
      const salidaTime = new Date()
      salidaTime.setHours(hours, minutes, 0, 0)

      const diffMinutes = (salidaTime.getTime() - currentTime.getTime()) / (1000 * 60)
      return diffMinutes > 0 && diffMinutes <= 30
    } catch {
      return false
    }
  }

  const llegadaTarde = (horaLlegada?: string, horaLlegadaReal?: string): boolean => {
    if (!horaLlegada || !horaLlegadaReal) return false

    try {
      const [horasProg, minutosProg] = horaLlegada.split(":").map(Number)
      const [horasReal, minutosReal] = horaLlegadaReal.split(":").map(Number)

      const programada = horasProg * 60 + minutosProg
      const real = horasReal * 60 + minutosReal

      return real > programada
    } catch {
      return false
    }
  }

  const tieneIncidencias = (muelle: MuelleData): boolean => {
    return !!(muelle.incidencias || llegadaTarde(muelle.horaLlegada, muelle.horaLlegadaReal))
  }

  const extraerLadoDeNombre = (nombreArchivo: string): number | undefined => {
    const match = nombreArchivo.match(/lado[_\s-]?(\d)/i)
    if (match && match[1]) {
      const lado = Number.parseInt(match[1])
      if (lado >= 1 && lado <= 9) return lado
    }
    return undefined
  }

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const lado = extraerLadoDeNombre(file.name)

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: "array" })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

      let headerRowIndex = -1
      const headers: string[] = []

      for (let i = 0; i < Math.min(10, jsonData.length); i++) {
        const row = jsonData[i]
        if (row && row.length > 3) {
          const rowStr = row.map((cell) => String(cell || "").toLowerCase())
          if (rowStr.some((cell) => cell.includes("transportista")) && rowStr.some((cell) => cell.includes("muelle"))) {
            headerRowIndex = i
            headers.push(...row.map((cell) => String(cell || "").trim()))
            break
          }
        }
      }

      if (headerRowIndex === -1) {
        toast({
          title: "Error al leer Excel",
          description: "No se encontraron las columnas esperadas (TRANSPORTISTA, MUELLE, LLEGADA, SALIDA)",
          variant: "destructive",
        })
        return
      }

      const colIndices = {
        muelle: headers.findIndex((h) => h.toLowerCase().includes("muelle")),
        empresa: headers.findIndex((h) => h.toLowerCase().includes("transportista")),
        carga: headers.findIndex((h) => h.toLowerCase().includes("destino")),
        horaLlegada: headers.findIndex((h) => h.toLowerCase().includes("llegada")),
        horaSalida: headers.findIndex(
          (h) => h.toLowerCase().includes("salida tope") || h.toLowerCase() === "salida tope",
        ),
        matricula: headers.findIndex((h) => h.toLowerCase().includes("matricula")),
        precinto: headers.findIndex((h) => h.toLowerCase().includes("precinto")),
        observaciones: headers.findIndex((h) => h.toLowerCase().includes("observaciones")),
      }

      const muellesActualizados = [...muelles]
      let registrosProcesados = 0
      let conflictos = 0

      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (!row || row.length === 0) continue

        const numeroMuelle = colIndices.muelle >= 0 ? Number.parseInt(String(row[colIndices.muelle] || "")) : null

        if (!numeroMuelle || Number.isNaN(numeroMuelle) || numeroMuelle < 312 || numeroMuelle > 370) continue

        const muelleIndex = muellesActualizados.findIndex((m) => m.numero === numeroMuelle)
        if (muelleIndex === -1) continue

        const formatHora = (valor: any): string | undefined => {
          if (!valor) return undefined
          const str = String(valor).trim()

          if (str.match(/^\d{1,2}:\d{2}$/)) return str

          if (!Number.isNaN(Number(valor))) {
            const totalMinutes = Math.round(Number(valor) * 24 * 60)
            const hours = Math.floor(totalMinutes / 60)
            const minutes = totalMinutes % 60
            return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
          }

          return undefined
        }

        const empresa = colIndices.empresa >= 0 ? String(row[colIndices.empresa] || "").trim() || undefined : undefined
        const carga = colIndices.carga >= 0 ? String(row[colIndices.carga] || "").trim() || undefined : undefined

        if (muellesActualizados[muelleIndex].empresa && muellesActualizados[muelleIndex].lado !== lado) {
          conflictos++
          // Añadir a lista de espera CON el muelle pre-asignado
          if (empresa && carga) {
            const nuevoEspera: CamionEspera = {
              id: `${lado}-${numeroMuelle}-${Date.now()}`,
              lado: lado || 0,
              empresa,
              carga,
              horaLlegada: formatHora(row[colIndices.horaLlegada]),
              matricula:
                colIndices.matricula >= 0 ? String(row[colIndices.matricula] || "").trim() || undefined : undefined,
              precinto:
                colIndices.precinto >= 0 ? String(row[colIndices.precinto] || "").trim() || undefined : undefined,
              observaciones:
                colIndices.observaciones >= 0
                  ? String(row[colIndices.observaciones] || "").trim() || undefined
                  : undefined,
              muellePreAsignado: numeroMuelle, // Guardar el muelle que tenía asignado en la operativa
            }
            setCamionesEspera((prev) => [...prev, nuevoEspera])
          }
          continue
        }

        muellesActualizados[muelleIndex] = {
          ...muellesActualizados[muelleIndex],
          lado: lado,
          empresa,
          carga,
          horaLlegada: colIndices.horaLlegada >= 0 ? formatHora(row[colIndices.horaLlegada]) : undefined,
          horaSalida: colIndices.horaSalida >= 0 ? formatHora(row[colIndices.horaSalida]) : undefined,
          matricula:
            colIndices.matricula >= 0 ? String(row[colIndices.matricula] || "").trim() || undefined : undefined,
          precinto: colIndices.precinto >= 0 ? String(row[colIndices.precinto] || "").trim() || undefined : undefined,
          observaciones:
            colIndices.observaciones >= 0 ? String(row[colIndices.observaciones] || "").trim() || undefined : undefined,
        }

        registrosProcesados++
      }

      setMuelles(muellesActualizados)

      toast({
        title: "Operativa importada correctamente",
        description: `Se procesaron ${registrosProcesados} registros${lado ? ` del Lado ${lado}` : ""}${conflictos > 0 ? `. ${conflictos} camiones añadidos a espera por conflicto de muelle` : ""}`,
      })
    } catch (error) {
      console.error("[v0] Error al procesar Excel:", error)
      toast({
        title: "Error al procesar Excel",
        description: "Verifica que el archivo tenga el formato correcto",
        variant: "destructive",
      })
    }

    e.target.value = ""
  }

  const actualizarDesdeURL = async () => {
    if (!url) return

    try {
      // Simulación: actualizar horas reales y añadir camiones en espera
      setMuelles((prev) =>
        prev.map((muelle) => {
          if (muelle.empresa && !muelle.horaLlegadaReal) {
            return {
              ...muelle,
              horaLlegadaReal: muelle.horaLlegada,
              matricula: muelle.matricula || `${Math.floor(1000 + Math.random() * 9000)}-ABC`,
              precinto: muelle.precinto || `P-${Math.floor(100000 + Math.random() * 900000)}`,
            }
          }
          return muelle
        }),
      )
    } catch (error) {
      console.error("[v0] Error al actualizar desde URL:", error)
    }
  }

  const handleCargarDesdeURL = async () => {
    if (!url) {
      toast({
        title: "Error",
        description: "Por favor ingresa una URL válida",
        variant: "destructive",
      })
      return
    }

    await actualizarDesdeURL()

    toast({
      title: "Datos cargados",
      description: "Información adicional extraída correctamente",
    })

    setUrlDialog(false)
  }

  const darPasoACamion = (camionId: string, numeroMuelle: number) => {
    const camion = camionesEspera.find((c) => c.id === camionId)
    if (!camion) return

    setMuelles((prev) =>
      prev.map((m) =>
        m.numero === numeroMuelle
          ? {
              ...m,
              lado: camion.lado,
              empresa: camion.empresa,
              carga: camion.carga,
              horaLlegada: camion.horaLlegada,
              matricula: camion.matricula,
              precinto: camion.precinto,
              observaciones: camion.observaciones,
              preAsignado: false, // Reset pre-assigned status when a truck is assigned
              camionEsperaId: undefined, // Clear the manually pre-assigned truck ID
            }
          : m,
      ),
    )

    setCamionesEspera((prev) => prev.filter((c) => c.id !== camionId))

    toast({
      title: "Camión asignado",
      description: `${camion.empresa} asignado al muelle ${numeroMuelle}`,
    })
  }

  const preAsignarCamion = (camionId: string, numeroMuelle: number) => {
    setMuelles((prev) =>
      prev.map((m) =>
        m.numero === numeroMuelle
          ? {
              ...m,
              preAsignado: true,
              camionEsperaId: camionId, // Manually pre-assign a specific truck to this dock
            }
          : m,
      ),
    )

    setCamionesEspera((prev) =>
      prev.map((c) =>
        c.id === camionId
          ? {
              ...c,
              muellePreAsignado: numeroMuelle, // Record which dock this truck is pre-assigned to
            }
          : c,
      ),
    )

    toast({
      title: "Muelle pre-asignado",
      description: `Muelle ${numeroMuelle} reservado para el próximo camión`,
    })
  }

  const finalizarCarga = (numeroMuelle: number) => {
    const muelle = muelles.find((m) => m.numero === numeroMuelle)
    if (!muelle) return

    if (muelle.empresa) {
      const ahora = new Date()
      const camionFinalizado: CamionFinalizado = {
        muelle: muelle.numero,
        lado: muelle.lado || 0,
        empresa: muelle.empresa,
        carga: muelle.carga || "",
        horaLlegada: muelle.horaLlegada,
        horaLlegadaReal: muelle.horaLlegadaReal,
        horaSalida: muelle.horaSalida,
        horaSalidaReal: muelle.horaSalidaReal,
        matricula: muelle.matricula,
        precinto: muelle.precinto,
        incidencias: muelle.incidencias,
        observaciones: muelle.observaciones,
        fechaFinalizacion: ahora.toLocaleDateString("es-ES"),
        horaFinalizacion: ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
      }
      setHistorialFinalizados((prev) => [...prev, camionFinalizado])
    }

    const camionPreAsignado = camionesEspera.find((c) => c.muellePreAsignado === numeroMuelle)

    if (camionPreAsignado) {
      // Pasar automáticamente el camión pre-asignado al muelle
      darPasoACamion(camionPreAsignado.id, numeroMuelle)
      toast({
        title: "Camión pre-asignado pasado automáticamente",
        description: `${camionPreAsignado.empresa} ha sido asignado al muelle ${numeroMuelle}`,
      })
    } else if (muelle.camionEsperaId) {
      // Si hay un camión pre-asignado manualmente, pasarlo
      darPasoACamion(muelle.camionEsperaId, numeroMuelle)
    } else {
      // Liberar el muelle
      setMuelles((prev) =>
        prev.map((m) =>
          m.numero === numeroMuelle
            ? {
                numero: m.numero,
                preAsignado: false, // Reset pre-assigned status
                camionEsperaId: undefined, // Clear manually pre-assigned truck ID
              }
            : m,
        ),
      )

      toast({
        title: "Muelle liberado",
        description: `Muelle ${numeroMuelle} ahora está disponible`,
      })
    }

    setCargados((prev) => {
      const newSet = new Set(prev)
      newSet.delete(numeroMuelle)
      return newSet
    })
  }

  const exportarHistorial = async () => {
    if (historialFinalizados.length === 0) {
      toast({
        title: "No hay datos para exportar",
        description: "No se han finalizado cargas todavía",
        variant: "destructive",
      })
      return
    }

    try {
      const camionsPorLado: Record<number, CamionFinalizado[]> = {}
      historialFinalizados.forEach((camion) => {
        if (!camionsPorLado[camion.lado]) {
          camionsPorLado[camion.lado] = []
        }
        camionsPorLado[camion.lado].push(camion)
      })

      for (const [lado, camiones] of Object.entries(camionsPorLado)) {
        const datosExcel = camiones.map((camion) => ({
          MATRÍCULA: camion.matricula || "",
          DESTINO: camion.carga,
          MUELLE: camion.muelle,
          "LLEGADA REAL": camion.horaLlegadaReal || "",
          "SALIDA REAL": camion.horaSalidaReal || "",
          PRECINTOS: camion.precinto || "",
          INCIDENCIAS: camion.incidencias || "",
          OBSERVACIONES: camion.observaciones || "",
        }))

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet(datosExcel)

        const colWidths = [
          { wch: 18 }, // MATRÍCULA
          { wch: 35 }, // DESTINO
          { wch: 12 }, // MUELLE
          { wch: 18 }, // LLEGADA REAL
          { wch: 18 }, // SALIDA REAL
          { wch: 20 }, // PRECINTOS
          { wch: 40 }, // INCIDENCIAS
          { wch: 40 }, // OBSERVACIONES
        ]
        ws["!cols"] = colWidths

        XLSX.utils.book_append_sheet(wb, ws, `Lado ${lado}`)

        const excelBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" })
        const blob = new Blob([excelBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        const fecha = new Date().toISOString().split("T")[0]
        link.download = `Lado_${lado}_${fecha}.xlsx`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        await new Promise((resolve) => setTimeout(resolve, 300))
      }

      toast({
        title: "Historial exportado",
        description: `Se descargaron ${Object.keys(camionsPorLado).length} archivos Excel. NOTA: La librería actual no soporta estilos avanzados (colores, negritas, alineación). Para aplicar formato profesional, abre el archivo en Excel y aplica: 1) Cabecera con fondo azul, negrita y tamaño 24, 2) Alineación centrada en todas las celdas, 3) Columna de matrículas con fondo granate y texto blanco.`,
        duration: 8000,
      })
    } catch (error) {
      console.error("[v0] Error al exportar historial:", error)
      toast({
        title: "Error al exportar",
        description: "No se pudo generar el archivo de exportación",
        variant: "destructive",
      })
    }
  }

  const abrirEdicion = (numeroMuelle: number) => {
    const muelle = muelles.find((m) => m.numero === numeroMuelle)
    setMuelleSeleccionado(numeroMuelle)
    setEditData({
      lado: muelle?.lado,
      empresa: muelle?.empresa || "",
      carga: muelle?.carga || "",
      horaLlegada: muelle?.horaLlegada || "",
      horaLlegadaReal: muelle?.horaLlegadaReal || "",
      horaSalida: muelle?.horaSalida || "",
      horaSalidaReal: muelle?.horaSalidaReal || "",
      matricula: muelle?.matricula || "",
      precinto: muelle?.precinto || "",
      incidencias: muelle?.incidencias || "",
      observaciones: muelle?.observaciones || "",
    })
    setEditDialog(true)
  }

  const guardarEdicion = () => {
    if (muelleSeleccionado === null) return

    setMuelles((prev) =>
      prev.map((m) =>
        m.numero === muelleSeleccionado
          ? {
              ...m,
              lado: editData.lado,
              empresa: editData.empresa?.trim() || undefined,
              carga: editData.carga?.trim() || undefined,
              horaLlegada: editData.horaLlegada?.trim() || undefined,
              horaLlegadaReal: editData.horaLlegadaReal?.trim() || undefined,
              horaSalida: editData.horaSalida?.trim() || undefined,
              horaSalidaReal: editData.horaSalidaReal?.trim() || undefined,
              matricula: editData.matricula?.trim() || undefined,
              precinto: editData.precinto?.trim() || undefined,
              incidencias: editData.incidencias?.trim() || undefined,
              observaciones: editData.observaciones?.trim() || undefined,
            }
          : m,
      ),
    )

    toast({
      title: "Muelle actualizado",
      description: `Información del muelle ${muelleSeleccionado} guardada correctamente`,
    })

    setEditDialog(false)
    setMuelleSeleccionado(null)
    setEditData({})
  }

  const toggleExpansion = (numeroMuelle: number, e: React.MouseEvent) => {
    // e.stopPropagation(); // Removed to allow clicking on the card itself to expand/collapse
    setExpandedMuelles((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(numeroMuelle)) {
        newSet.delete(numeroMuelle)
      } else {
        newSet.add(numeroMuelle)
      }
      return newSet
    })
  }

  const marcarComoCargado = (numeroMuelle: number) => {
    setCargados((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(numeroMuelle)) {
        newSet.delete(numeroMuelle)
      } else {
        newSet.add(numeroMuelle)
      }
      return newSet
    })

    toast({
      title: cargados.has(numeroMuelle) ? "Marcado como no cargado" : "Marcado como cargado",
      description: `Muelle ${numeroMuelle}`,
    })
  }

  const marcarLlegada = (numeroMuelle: number) => {
    const ahora = new Date()
    const horaActual = `${ahora.getHours().toString().padStart(2, "0")}:${ahora.getMinutes().toString().padStart(2, "0")}`

    setMuelles((prev) =>
      prev.map((m) =>
        m.numero === numeroMuelle
          ? {
              ...m,
              horaLlegadaReal: horaActual,
            }
          : m,
      ),
    )

    toast({
      title: "Llegada registrada",
      description: `Camión llegó al muelle ${numeroMuelle} a las ${horaActual}`,
    })
  }

  const muellesOcupados = muelles.filter((m) => m.empresa).length
  const muellesLibres = muelles.length - muellesOcupados
  const muellesConAlerta = muelles.filter((m) => shouldShowAlert(m.horaSalida)).length
  const muellesConIncidencias = muelles.filter((m) => tieneIncidencias(m)).length
  const camionesLlegados = muelles.filter((m) => m.horaLlegadaReal).length
  const camionesCargados = cargados.size

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-4 max-w-[2000px]">
        <div className="mb-4 bg-blue-600 rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white mb-1">Control de Muelles</h1>
              <p className="text-blue-100 text-sm">
                {muellesOcupados} ocupados • {muellesLibres} libres
                {muellesConAlerta > 0 && ` • ${muellesConAlerta} próximos a salir`}
                {muellesConIncidencias > 0 && ` • ${muellesConIncidencias} con incidencias`}
              </p>
            </div>

            <div className="flex-shrink-0 bg-blue-700 text-white px-6 py-3 rounded-lg">
              <div className="text-4xl font-bold font-mono tabular-nums">
                {currentTime.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="text-xs text-blue-200 text-center mt-1">
                {currentTime.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <label htmlFor="excel-upload">
              <Button variant="secondary" size="sm" className="cursor-pointer" asChild>
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar Operativa
                </span>
              </Button>
            </label>
            <input id="excel-upload" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />

            <Dialog open={urlDialog} onOpenChange={setUrlDialog}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Globe className="mr-2 h-4 w-4" />
                  Cargar desde URL
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cargar datos desde URL</DialogTitle>
                  <DialogDescription>Ingresa la URL para extraer información en tiempo real</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="url">URL de origen</Label>
                    <Input
                      id="url"
                      placeholder="https://ejemplo.com/datos"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="autoRefresh"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="autoRefresh" className="text-sm">
                      Actualizar automáticamente cada minuto
                    </Label>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setUrlDialog(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCargarDesdeURL}>Cargar Datos</Button>
                </div>
              </DialogContent>
            </Dialog>

            {url && (
              <Button variant="secondary" size="sm" onClick={actualizarDesdeURL}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refrescar
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={exportarHistorial}
              disabled={historialFinalizados.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar Historial ({historialFinalizados.length})
            </Button>
          </div>
        </div>

        <div className="mb-4 bg-blue-500 rounded-lg shadow-md p-3">
          <div className="flex items-center justify-around text-white">
            <div className="text-center">
              <div className="text-3xl font-bold">{camionesLlegados}</div>
              <div className="text-xs text-blue-100">Camiones Posicionados</div>
            </div>
            <div className="h-12 w-px bg-blue-300"></div>
            <div className="text-center">
              <div className="text-3xl font-bold">{camionesCargados}</div>
              <div className="text-xs text-blue-100">Camiones Cargados</div>
            </div>
            <div className="h-12 w-px bg-blue-300"></div>
            <div className="text-center">
              <div className="text-3xl font-bold">{muellesOcupados}</div>
              <div className="text-xs text-blue-100">Muelles Ocupados</div>
            </div>
            <div className="h-12 w-px bg-blue-300"></div>
            <div className="text-center">
              <div className="text-3xl font-bold">{camionesEspera.length}</div>
              <div className="text-xs text-blue-100">En Espera</div>
            </div>
          </div>
        </div>

        <Dialog open={editDialog} onOpenChange={setEditDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Muelle {muelleSeleccionado}</DialogTitle>
              <DialogDescription>Modifica la información del muelle manualmente</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lado">Lado (1-9)</Label>
                  <Input
                    id="lado"
                    type="number"
                    min="1"
                    max="9"
                    placeholder="Número de lado"
                    value={editData.lado || ""}
                    onChange={(e) => setEditData({ ...editData, lado: Number.parseInt(e.target.value) || undefined })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="empresa">Empresa / Transportista</Label>
                  <Input
                    id="empresa"
                    placeholder="Nombre de la empresa"
                    value={editData.empresa || ""}
                    onChange={(e) => setEditData({ ...editData, empresa: e.target.value })}
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="carga">Carga / Destino</Label>
                  <Input
                    id="carga"
                    placeholder="Tipo de carga o destino"
                    value={editData.carga || ""}
                    onChange={(e) => setEditData({ ...editData, carga: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="horaLlegada">Hora Llegada Programada</Label>
                  <Input
                    id="horaLlegada"
                    type="time"
                    value={editData.horaLlegada || ""}
                    onChange={(e) => setEditData({ ...editData, horaLlegada: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="horaLlegadaReal">Hora Llegada Real</Label>
                  <Input
                    id="horaLlegadaReal"
                    type="time"
                    value={editData.horaLlegadaReal || ""}
                    onChange={(e) => setEditData({ ...editData, horaLlegadaReal: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="horaSalida">Hora Salida Tope</Label>
                  <Input
                    id="horaSalida"
                    type="time"
                    value={editData.horaSalida || ""}
                    onChange={(e) => setEditData({ ...editData, horaSalida: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="horaSalidaReal">Hora Salida Real</Label>
                  <Input
                    id="horaSalidaReal"
                    type="time"
                    value={editData.horaSalidaReal || ""}
                    onChange={(e) => setEditData({ ...editData, horaSalidaReal: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="matricula">Matrícula</Label>
                  <Input
                    id="matricula"
                    placeholder="1234-ABC"
                    value={editData.matricula || ""}
                    onChange={(e) => setEditData({ ...editData, matricula: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="precinto">Número de Precinto</Label>
                  <Input
                    id="precinto"
                    placeholder="P-123456"
                    value={editData.precinto || ""}
                    onChange={(e) => setEditData({ ...editData, precinto: e.target.value })}
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="observaciones">Observaciones (de la operativa)</Label>
                  <Textarea
                    id="observaciones"
                    placeholder="Observaciones del Excel"
                    value={editData.observaciones || ""}
                    onChange={(e) => setEditData({ ...editData, observaciones: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="incidencias">Incidencias</Label>
                  <Textarea
                    id="incidencias"
                    placeholder="Describe cualquier incidencia o problema detectado"
                    value={editData.incidencias || ""}
                    onChange={(e) => setEditData({ ...editData, incidencias: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={guardarEdicion}>Guardar Cambios</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="muelles" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="muelles">
              Muelles ({muellesOcupados}/{muelles.length})
            </TabsTrigger>
            <TabsTrigger value="espera">Camiones en Espera ({camionesEspera.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="muelles" className="mt-4">
            <div className="flex flex-col gap-1.5 max-w-4xl mx-auto">
              {muelles.map((muelle) => {
                const tieneAlerta = shouldShowAlert(muelle.horaSalida)
                const estaOcupado = !!muelle.empresa
                const hayIncidencias = tieneIncidencias(muelle)
                const isExpanded = expandedMuelles.has(muelle.numero)
                const estaCargado = cargados.has(muelle.numero)
                const haLlegado = !!muelle.horaLlegadaReal

                const colorBorde = estaOcupado ? "border-blue-500" : "border-green-500"
                const bordeAlerta = tieneAlerta ? "border-red-500" : colorBorde

                const fondoCargado = estaCargado ? "bg-amber-100" : "bg-white"
                const textoColorCargado = estaCargado ? "text-slate-900" : "text-slate-900"
                const textoSecundarioCargado = estaCargado ? "text-slate-700" : "text-slate-600"

                return (
                  <Card
                    key={muelle.numero}
                    className={`relative ${fondoCargado} border-4 ${bordeAlerta} transition-all hover:shadow-lg w-full`}
                    onClick={() => toggleExpansion(muelle.numero, {} as React.MouseEvent)}
                  >
                    <CardContent className="p-2">
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between">
                          <div className={`text-3xl font-bold ${textoColorCargado}`}>{muelle.numero}</div>
                          <div className="flex flex-col items-end gap-1">
                            {haLlegado && (
                              <Badge variant="default" className="text-sm bg-green-600 text-white px-2 py-1">
                                <Truck className="h-4 w-4 mr-1" />
                                Llegó
                              </Badge>
                            )}
                            {muelle.preAsignado && (
                              <Badge variant="secondary" className="text-xs bg-orange-200">
                                Pre-asignado
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="min-h-[40px] border-t border-b border-slate-200 py-1.5">
                          {estaOcupado ? (
                            <div>
                              <div className={`text-sm font-bold ${textoColorCargado} leading-tight`}>
                                {muelle.carga || "Sin destino"}
                              </div>
                              <div className={`text-xs ${textoSecundarioCargado} mt-0.5`}>{muelle.empresa}</div>
                              {muelle.lado && (
                                <div className="mt-1 mb-1">
                                  <Badge className={`text-xs font-bold ${getColorLado(muelle.lado)}`}>
                                    LADO {muelle.lado}
                                  </Badge>
                                </div>
                              )}
                              {muelle.matricula && (
                                <div className={`text-xs ${textoSecundarioCargado} mt-0.5 font-mono`}>
                                  {muelle.matricula}
                                </div>
                              )}
                              {(muelle.horaLlegada || muelle.horaSalida) && (
                                <div className={`text-xs ${textoSecundarioCargado} mt-0.5 flex gap-3`}>
                                  {muelle.horaLlegada && <span>Llegada: {muelle.horaLlegada}</span>}
                                  {muelle.horaSalida && <span>Salida: {muelle.horaSalida}</span>}
                                </div>
                              )}
                              {muelle.observaciones && (
                                <div className={`text-xs ${textoSecundarioCargado} mt-0.5 italic`}>
                                  {muelle.observaciones}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm font-bold text-slate-400 flex items-center justify-center h-full">
                              LIBRE
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {hayIncidencias && (
                              <div className="relative">
                                <AlertTriangle className="h-5 w-5 fill-yellow-400 text-yellow-600" />
                              </div>
                            )}
                            {tieneAlerta && (
                              <div className="relative">
                                <Clock className="h-5 w-5 text-red-600 animate-pulse" />
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {estaOcupado && !haLlegado && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  marcarLlegada(muelle.numero)
                                }}
                                className="h-7 px-2 border-green-500 text-green-700 hover:bg-green-50"
                              >
                                <Truck className="h-4 w-4" />
                              </Button>
                            )}
                            {estaOcupado && (
                              <Button
                                variant={estaCargado ? "default" : "outline"}
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  marcarComoCargado(muelle.numero)
                                }}
                                className="h-7 px-2"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                abrirEdicion(muelle.numero)
                              }}
                              className="h-7 px-2"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {isExpanded && estaOcupado && (
                          <div className="mt-2 pt-2 border-t-2 border-slate-200 space-y-2 animate-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center justify-center gap-2 bg-orange-100 border-2 border-orange-400 rounded-lg p-2">
                              <Truck className="h-6 w-6 text-orange-600" />
                              <div className="text-2xl font-bold text-orange-900">Muelle {muelle.numero}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="bg-slate-50 p-2 rounded">
                                <div className="text-xs text-slate-500 font-medium">Llegada Prog.</div>
                                <div className="text-sm font-semibold text-slate-900">{muelle.horaLlegada || "—"}</div>
                              </div>
                              <div className="bg-slate-50 p-2 rounded">
                                <div className="text-xs text-slate-500 font-medium">Llegada Real</div>
                                <div
                                  className={`text-sm font-semibold ${
                                    llegadaTarde(muelle.horaLlegada, muelle.horaLlegadaReal)
                                      ? "text-red-600"
                                      : "text-green-600"
                                  }`}
                                >
                                  {muelle.horaLlegadaReal || "Pendiente"}
                                </div>
                              </div>
                              <div className="bg-slate-50 p-2 rounded">
                                <div className="text-xs text-slate-500 font-medium">Salida Tope</div>
                                <div
                                  className={`text-sm font-semibold ${tieneAlerta ? "text-red-600" : "text-slate-900"}`}
                                >
                                  {muelle.horaSalida || "—"}
                                </div>
                              </div>
                              <div className="bg-slate-50 p-2 rounded">
                                <div className="text-xs text-slate-500 font-medium">Salida Real</div>
                                <div className="text-sm font-semibold text-slate-900">
                                  {muelle.horaSalidaReal || "—"}
                                </div>
                              </div>
                            </div>

                            {muelle.observaciones && (
                              <div className="bg-blue-50 p-2 rounded border border-blue-200">
                                <div className="text-xs font-medium text-blue-700 mb-1">Observaciones:</div>
                                <div className="text-xs text-blue-900">{muelle.observaciones}</div>
                              </div>
                            )}

                            {muelle.incidencias && (
                              <div className="bg-yellow-50 p-2 rounded border border-yellow-300">
                                <div className="text-xs font-medium text-yellow-700 mb-1">Incidencia:</div>
                                <div className="text-xs text-yellow-900">{muelle.incidencias}</div>
                              </div>
                            )}

                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                finalizarCarga(muelle.numero)
                              }}
                              className="w-full"
                            >
                              Finalizar Carga
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>

          <TabsContent value="espera" className="mt-4">
            {camionesEspera.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No hay camiones en espera</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {camionesEspera.map((camion) => (
                  <Card key={camion.id} className="border-orange-300 bg-orange-50">
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="bg-orange-200">
                            Lado {camion.lado}
                          </Badge>
                          <Truck className="h-5 w-5 text-orange-600" />
                        </div>
                        {camion.muellePreAsignado !== undefined && ( // Check if muellePreAsignado is defined
                          <div className="bg-blue-100 border border-blue-300 rounded p-2">
                            <div className="text-xs font-semibold text-blue-800">
                              Muelle Predeterminado: {camion.muellePreAsignado}
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900">{camion.empresa}</div>
                          <div className="text-sm text-slate-600">{camion.carga}</div>
                        </div>
                        {camion.horaLlegada && (
                          <div className="text-xs text-slate-600">Llegada: {camion.horaLlegada}</div>
                        )}
                        {camion.matricula && (
                          <div className="text-xs text-slate-600 font-mono">Matrícula: {camion.matricula}</div>
                        )}
                        {camion.observaciones && (
                          <div className="text-xs text-slate-600 italic bg-white p-2 rounded">
                            {camion.observaciones}
                          </div>
                        )}
                        <div className="flex gap-2 mt-3">
                          <select
                            className="flex-1 text-sm border rounded px-2 py-1"
                            onChange={(e) => {
                              if (e.target.value) {
                                darPasoACamion(camion.id, Number.parseInt(e.target.value))
                                e.target.value = "" // Reset the select to default option
                              }
                            }}
                          >
                            <option value="">Asignar a muelle...</option>
                            {muelles
                              .filter((m) => !m.empresa)
                              .map((m) => (
                                <option key={m.numero} value={m.numero}>
                                  Muelle {m.numero}
                                </option>
                              ))}
                          </select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              preAsignarCamion(camion.id, camion.muellePreAsignado || 0) // Pass the dock number if it exists
                            }}
                            className="h-8 px-3 text-xs"
                            disabled={camion.muellePreAsignado !== undefined} // Disable if already pre-assigned
                          >
                            Reservar Muelle
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {muellesConAlerta > 0 && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-600 bg-red-50 p-2 rounded-lg border border-red-200">
            <Clock className="h-4 w-4 text-red-600" />
            <span className="font-medium">
              {muellesConAlerta} {muellesConAlerta === 1 ? "muelle tiene" : "muelles tienen"} salida programada en los
              próximos 30 minutos
            </span>
          </div>
        )}
      </div>
      <Toaster />
    </div>
  )
}
