import {Component, Inject, OnInit} from '@angular/core';
import {IKubeBenchReport} from '../../../../../../core/entities/IKubeBenchReport';
import {FormBuilder} from '@angular/forms';
import {KubeBenchService} from '../../../../../../core/services/kube-bench.service';
import {MAT_DIALOG_DATA} from '@angular/material/dialog';
import {CommonService} from '../../../../../../core/services/common.service';
import {take} from 'rxjs/operators';

@Component({
  standalone: false,
  selector: 'app-kube-bench-dialog',
  templateUrl: './kube-bench-dialog.component.html',
  styleUrls: ['./kube-bench-dialog.component.scss']
})

export class KubeBenchDialogComponent implements OnInit{
  selectedProvider = '';
  backendUrl = '';
  reportEndpointReady = false;
  reportEndpointError = 'Scanner report ingestion endpoint is not configured.';
  clusterId: number;
  report: IKubeBenchReport;
  environments: {name: string, value: string}[];
  cronjobOpt = true;
  cronjobTime = 'daily';
  cronjobScheduleOpts = {
    weekly: '0 0 * * 0',
    daily: '0 0 * * *',
    monthly: '0 0 1 * *'
  };
  nextButtonDisabled = true;
  // The scanner API key is deliberately not retrieved into the browser's Helm command.

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { clusterId: number },
    private formBuilder: FormBuilder,
    private kubeBenchService: KubeBenchService,
    private commonService: CommonService,
  ) { }

  ngOnInit(): void {
    this.getConfigFileList();
    this.commonService.getBaseUrl().pipe(take(1)).subscribe({
      next: response => {
        const endpoint = (response.data as {reportIngestionUrl?: string | null}).reportIngestionUrl;
        if (endpoint && /^https?:\/\//.test(endpoint)) {
          this.backendUrl = endpoint;
          this.reportEndpointReady = true;
          this.reportEndpointError = '';
        } else {
          this.reportEndpointReady = false;
          this.reportEndpointError = 'Configure SCANNER_REPORT_INGESTION_URL with an address reachable from Kubernetes Pods. Browser localhost URLs cannot receive scanner reports.';
        }
      },
      error: () => {
        this.reportEndpointReady = false;
        this.reportEndpointError = 'Unable to load scanner report-ingestion configuration.';
      }
    });
    this.clusterId = this.data.clusterId;



  }

  getConfigFileList() {
    this.kubeBenchService.getConfigFileList()
      .pipe(take(1))
      .subscribe(rtrn => {
        this.environments = rtrn.data;
      });
  }

  proceedToNext($event) {
    this.nextButtonDisabled = false;
  }
}
