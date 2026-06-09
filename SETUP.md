# Setup — Polla Mundialera 2026 🏆

## Tiempo total: ~20 minutos

---

## 1. Supabase (base de datos gratuita)

1. Ve a **https://supabase.com** → Sign up con Google
2. **New project** → nombre: `worldcup2026` → región: South America (São Paulo)
3. Guarda tu **database password** en un lugar seguro
4. Ve a **SQL Editor** → pega el contenido de `supabase/schema.sql` → Run
5. Ve a **Settings → API** y copia:
   - **Project URL** → ya está en `static/js/config.js`
   - **anon / public key** → pega en `static/js/config.js` donde dice `TU_ANON_KEY_AQUI`
   - **service_role key** → necesario para Vercel (paso 3)

---

## 2. GitHub (para deploy en Vercel)

```bash
cd "c:\Users\eduar\Self-Finance\Self-Finance\WorldCup"
git init
git add .
git commit -m "Polla Mundialera 2026 - Familia Lozada Vargas"
```

Crear repo en **github.com** → nuevo repo `worldcup2026` → sube el código:
```bash
git remote add origin https://github.com/TU_USUARIO/worldcup2026.git
git push -u origin main
```

---

## 3. Vercel (hosting gratuito)

1. Ve a **https://vercel.com** → Sign up con GitHub
2. **New Project** → importa el repo `worldcup2026`
3. **Environment Variables** → agrega estas:

| Variable | Valor |
|----------|-------|
| `FOOTBALL_DATA_KEY` | `e06231b5cd7d4d38b02d2bfc62252f25` |
| `SUPABASE_URL` | `https://izjbpheewbfshotjsgim.supabase.co` |
| `SUPABASE_SERVICE_KEY` | (service_role key de Supabase Settings → API) |
| `FAMILY_CODE` | `LozadaVargas2026` |

4. **Deploy** → en ~2 min tienes tu URL (ej: `worldcup2026.vercel.app`)

---

## 4. Carga inicial de partidos

Una vez deployado, abre en el browser:
```
https://TU-APP.vercel.app/api/refresh
```

Esto descarga todos los 104 partidos del Mundial desde football-data.org y los guarda en Supabase.

Verás: `{"ok": true, "matches": 104, "standings": 48, ...}`

---

## 5. Cron automático (actualizaciones en vivo)

1. Ve a **https://cron-job.org** → crea cuenta gratis
2. **Create cronjob**:
   - URL: `https://TU-APP.vercel.app/api/refresh`
   - Horario: `*/10 * * * *` (cada 10 min)
3. Activa el cron → listo, los resultados se actualizan solos

---

## 6. Comparte con la familia

URL de tu app: `https://TU-APP.vercel.app`

Manda el link por WhatsApp con el código familiar: **LozadaVargas2026**

---

## 7. Exportar a Excel (cuando quieras)

```bash
cd "c:\Users\eduar\Self-Finance\Self-Finance\WorldCup"
pip install -r requirements.txt
python python/export_excel.py
```

Genera `excel/polla_mundialera.xlsx` con 5 hojas:
- **Tabla General** — clasificación con puntos
- **Pronósticos** — todos los pronósticos
- **Partidos** — resultados
- **Grupos** — posiciones
- **Goleadores** — top scorers

---

## Sistema de puntos

| Acierto | Puntos |
|---------|--------|
| Resultado correcto (G/E/P) | 2 pts |
| Marcador exacto | +3 pts (total 5) |
| Clasificado en eliminatorias | +3 pts |
| Campeón del mundo | 10 pts |
| Subcampeón | 5 pts |
| Goleador del torneo | 5 pts |

---

## Fotos de la familia

Para agregar fotos de cada miembro:
1. Supabase Dashboard → **Storage** → Create bucket `photos` (Public)
2. Sube la foto → copia la URL pública
3. Supabase Dashboard → **Table Editor** → `participants` → edita la fila → pega URL en `photo_url`

La foto aparece automáticamente en la tabla familiar.

---

## Actualizar código familiar

Si quieres cambiar el código: Vercel Dashboard → Environment Variables → `FAMILY_CODE` → editar → Redeploy.
