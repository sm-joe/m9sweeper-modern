import {Component, Inject, OnInit} from '@angular/core';
import {take} from 'rxjs/operators';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {CommonService} from '../../../../../core/services/common.service';
import {NgxUiLoaderService} from 'ngx-ui-loader';

@Component({
  standalone: false,
  selector: 'app-falco-dialog',
  templateUrl: './falco-dialog.component.html',
  styleUrls: ['./falco-dialog.component.scss']
})
export class FalcoDialogComponent implements OnInit {

  backendUrl = '';
  reportEndpointReady = false;
  reportEndpointError = 'Scanner report ingestion endpoint is not configured.';
  clusterId: number;
  level = 'Error';
  priorityLevels: string [] = ['', 'Emergency', 'Alert', 'Critical', 'Error', 'Warning', 'Notice', 'Informational', 'Debug'];

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { clusterId: number },
    private matDialogRef: MatDialogRef<FalcoDialogComponent>,
    private commonService: CommonService,
    private loaderService: NgxUiLoaderService,
  ) {}

  ngOnInit(): void {
    this.loaderService.start();
    this.commonService.getBaseUrl().pipe(take(1)).subscribe({
      next: response => {
        const endpoint = (response.data as {reportIngestionUrl?: string | null}).reportIngestionUrl;
        if (endpoint && /^https?:\/\//.test(endpoint) && !/^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::|\/|$)/i.test(endpoint)) {
          this.backendUrl = endpoint.replace(/\/$/, '');
          this.reportEndpointReady = true;
          this.reportEndpointError = '';
        } else {
          this.reportEndpointReady = false;
          this.reportEndpointError = 'Configure a Kubernetes Pod-reachable SCANNER_REPORT_INGESTION_URL; browser localhost cannot receive Falco webhook events.';
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
  }
}
