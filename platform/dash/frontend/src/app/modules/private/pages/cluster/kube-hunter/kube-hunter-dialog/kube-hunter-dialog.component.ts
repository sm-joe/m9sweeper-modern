import {Component, Inject, OnInit} from '@angular/core';
import {CommonService} from '../../../../../../core/services/common.service';
import {switchMap, take, takeUntil, takeWhile} from 'rxjs/operators';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {NgxUiLoaderService} from 'ngx-ui-loader';
import {Subject, timer} from 'rxjs';
import {IKubeHunterReport} from '../../../../../../core/entities/IKubeHunterReport';
import {KubeHunterService} from '../../../../../../core/services/kube-hunter.service';
import {AlertService} from 'src/app/core/services/alert.service';
import {Router} from '@angular/router';

@Component({
  selector: 'app-kube-hunter-dialog',
  templateUrl: './kube-hunter-dialog.component.html',
  styleUrls: ['./kube-hunter-dialog.component.scss']
})
export class KubeHunterDialogComponent implements OnInit {

  cronjobOpt = true;
  cronjobTime = 'daily';
  backendUrl = '';
  reportEndpointReady = false;
  reportEndpointError = 'Scanner report ingestion endpoint is not configured.';
  clusterId: number;
  report: IKubeHunterReport;
  modalOpened = Date.now();

  // IDE may suggest this is unused, but it is used in the HTML
  cronjobScheduleOpts = {
    weekly: '0 0 * * 0',
    daily: '0 0 * * *',
    monthly: '0 0 1 * *'
  };

  private unsubscribe$ = new Subject<void>();


  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { clusterId: number },
    private matDialogRef: MatDialogRef<KubeHunterDialogComponent>,
    private commonService: CommonService,
    private loaderService: NgxUiLoaderService,
    private kubeHunterService: KubeHunterService,
    private alertService: AlertService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loaderService.start();
    this.commonService.getBaseUrl().pipe(take(1)).subscribe({
      next: response => {
        // The browser's base URL may be localhost, which resolves to the
        // kube-hunter pod itself. Only use the dedicated Pod-reachable endpoint.
        const endpoint = (response.data as {reportIngestionUrl?: string | null}).reportIngestionUrl;
        try {
          const url = new URL(endpoint || '');
          if (url.protocol !== 'https:' || url.username || url.password ||
              url.search || url.hash || url.pathname !== '/' ||
              /^(localhost|127(?:\\.\\d{1,3}){3}|\\[::1\\])$/i.test(url.hostname)) {
            throw new Error('A trusted HTTPS report-ingestion origin is required');
          }
          this.backendUrl = url.origin;
          this.reportEndpointReady = true;
          this.reportEndpointError = '';
        } catch {
          this.reportEndpointReady = false;
          this.reportEndpointError = 'Set SCANNER_REPORT_INGESTION_URL to a trusted HTTPS origin reachable from Kubernetes Pods. Loopback, credentials, query strings and paths are not allowed.';
        }
        this.loaderService.stop();
      },
      error: () => {
        this.reportEndpointReady = false;
        this.reportEndpointError = 'Unable to load scanner report-ingestion configuration.';
        this.loaderService.stop();
      }
    });
    this.clusterId = this.data.clusterId;
    this.lookForReport();
  }

  lookForReport() {
    // Check every 30s to see if a new report has displayed
    timer(30000, 30000).pipe(
      takeWhile(() => !this.report),
      switchMap(() => {
        return this.kubeHunterService.getRecentKubehunterScan(this.clusterId, this.modalOpened);
      }),
      takeUntil(this.unsubscribe$)
    ).subscribe((report) => {
      this.report = report;
      if (this.report) {
        this.alertService.info('kube-hunter done running');
      }
    });
  }

  viewReport(id: number) {
    this.router.navigate(['/private', 'clusters', this.clusterId, 'kubehunter', id])
      .then(() => this.matDialogRef.close({ dontRefresh: true}));
  }
}


