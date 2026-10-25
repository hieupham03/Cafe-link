param([Parameter(Mandatory=$true)][string]$Docx,[Parameter(Mandatory=$true)][string]$Pdf,[Parameter(Mandatory=$true)][string]$SummaryPath)
$ErrorActionPreference='Stop'
$app=$null;$document=$null;$owned=$false
$summary=[ordered]@{status='RUNNING';renderer='Microsoft Word COM';modifiedExistingUserDocument=$false}
try {
    $app=New-Object -ComObject Word.Application
    if($app.Documents.Count -ne 0){throw 'Automation instance already has documents; no existing document was changed.'}
    $owned=$true;$app.Visible=$false;$app.DisplayAlerts=0;$app.AutomationSecurity=3
    $document=$app.Documents.Open([IO.Path]::GetFullPath($Docx),$false,$false)
    $document.Fields.Update() | Out-Null
    foreach($toc in $document.TablesOfContents){
        $toc.Update()
        $toc.Range.Font.Name='Times New Roman';$toc.Range.Font.Size=10
        $toc.Range.ParagraphFormat.SpaceBefore=0;$toc.Range.ParagraphFormat.SpaceAfter=0
        $toc.Range.ParagraphFormat.LineSpacingRule=0
    }
    $document.Repaginate()
    foreach($toc in $document.TablesOfContents){$toc.UpdatePageNumbers()}
    $document.Save()
    $document.ExportAsFixedFormat([IO.Path]::GetFullPath($Pdf),17)
    $summary.pages=$document.ComputeStatistics(2)
    $summary.tables=$document.Tables.Count;$summary.images=$document.InlineShapes.Count
    $summary.status='PASS'
} catch {$summary.status='FAIL';$summary.error=$_.Exception.Message}
finally {
    if($null -ne $document){$document.Close(0);[void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)}
    if($null -ne $app){if($owned){$app.Quit()};[void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)}
    $summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $SummaryPath -Encoding UTF8
}
$summary | ConvertTo-Json -Compress
if($summary.status -ne 'PASS'){exit 1}
