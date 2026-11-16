# Genera entrega\enlaces.zip con el archivo de enlaces (ejecutar después de completar enlaces.txt)
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$txt = Join-Path $aqui 'enlaces.txt'
if (Select-String -Path $txt -Pattern 'PEGAR_ENLACE|NOMBRE COMPLETO' -Quiet) {
    Write-Warning 'enlaces.txt todavía tiene campos sin completar.'
}
Compress-Archive -Path $txt -DestinationPath (Join-Path $aqui 'enlaces.zip') -Force
Write-Host "Creado: $(Join-Path $aqui 'enlaces.zip')"
