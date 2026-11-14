# ALEPI Business API 0.9.0

La aplicación trabaja primero en SQLite y se sincroniza con esta API cuando los celulares pueden acceder al servidor. La API es la única que accede a PostgreSQL. El entorno Windows actual sirve para pruebas; antes de publicar el acceso por Internet instala HTTPS y cierra el modo de transición.

## Inicio normal en Windows

1. La laptop debe estar encendida y conectada a la misma red Wi-Fi que los celulares.
2. PostgreSQL debe estar iniciado.
3. Abre PowerShell y ejecuta:

   ```powershell
   cd C:\dev\projects\alepi_business_core\server
   .\INICIAR_API.bat
   ```

4. No cierres esa ventana mientras quieras sincronizar.
5. En la laptop prueba `http://127.0.0.1:3100/api/health`.
6. En el celular prueba `http://IP-DE-LA-LAPTOP:3100/api/health` usando la IP guardada en la app.

No es necesario conectar el celular por cable USB para sincronizar. El cable se necesita solamente para instalar o actualizar la app con `flutter run`.

## Configuración

El archivo `server\.env` debe contener como mínimo:

```text
DATABASE_URL=postgresql://usuario:clave@localhost:5432/alepi_business_dev
PORT=3100
DB_SSL=false
COMMERCIAL_AUTH_STRICT=false
```

No compartas ni reemplaces el `.env` durante una actualización. El instalador del Bloque 8 conserva ese archivo y activa el modo de transición.

## Esquema actual

- API: 0.9.0
- PostgreSQL: esquema 8
- Migración: `sql\008_commercial_access.sql`
- Entidades sincronizadas: empresas, sucursales, usuarios, permisos, inventario, caja, ventas, pagos, clientes, fiado, abonos, proveedores, compras, mesas y comandas.

## Aislamiento multiempresa

Todos los cambios identifican su empresa, incluso con `COMMERCIAL_AUTH_STRICT=false`.
La API valida pertenencia de registros/referencias y serializa cambios concurrentes.
Compartir usuario exige acceso a su empresa de origen; sus cambios de perfil/PIN se
publican para todas sus empresas. Reinicia la API después de actualizar el código.
Este bloque no requiere migración SQL.

Pruebas normales: `npm test`. Integración PostgreSQL optativa con datos ficticios
revertidos por `ROLLBACK`:

```powershell
node -e 'process.env.ALEPI_TEST_POSTGRES="1";require("./test/postgres_multi_company.integration.test.js");'
```

Si la API se detiene, la operación local continúa en SQLite. Cuando vuelva a estar disponible, usa **Sincronizar ahora**.
# Acceso comercial 0.9.0 (Bloque 8)

Para el entorno de prueba existente, instala la migracion `sql/008_commercial_access.sql`
mediante `INSTALAR_BLOQUE8_COMERCIAL.bat` desde la raiz del paquete. El instalador
hace un `pg_dump` previo, conserva `server/.env` y configura temporalmente
`COMMERCIAL_AUTH_STRICT=false`. El propietario activa cada empresa y empareja
los demas celulares antes de habilitar `COMMERCIAL_AUTH_STRICT=true`.

En la PC de ALEPI, desde `server`, emite un codigo temporal:

`node owner_license_cli.js emitir "Nombre del negocio" 2 365`

El cliente introduce el codigo en Conexión LAN / Cloud > ACTIVAR ESTA EMPRESA.
Para conocer las empresas y renovar o revocar:

- `node owner_license_cli.js listar`
- `node owner_license_cli.js renovar ID_EMPRESA 365`
- `node owner_license_cli.js revocar ID_EMPRESA`
- `node owner_license_cli.js verificar` antes de cerrar la transición.

El modo de transición confía temporalmente en los identificadores antiguos por
la red LAN. Nunca expongas esa API a Internet. Para publicar el servicio, usa
HTTPS y un dominio bajo control de ALEPI, configura PostgreSQL con SSL validado,
finaliza la activación de todos los dispositivos y establece
`COMMERCIAL_AUTH_STRICT=true`. El código no instala ni publica infraestructura cloud.
