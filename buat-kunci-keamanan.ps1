# Membuat 32 byte acak kriptografis tanpa mencetak rahasia ke terminal.
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()

try {
    $bytes = New-Object byte[] 32
    $generator.GetBytes($bytes)

    # Nilai hex ini ditempel hanya ke Script Properties SECURITY_KEY.
    $key = [System.BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant()
    Set-Clipboard -Value $key
    Write-Output "Kunci keamanan sudah ada di clipboard. Tempel ke Script Properties SECURITY_KEY."
    Write-Output "Jangan kirim kunci melalui chat dan jangan masukkan ke GitHub."
}
finally {
    $generator.Dispose()
}
