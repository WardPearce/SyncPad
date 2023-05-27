/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CanaryModel } from '../models/CanaryModel';
import type { CreateCanaryModel } from '../models/CreateCanaryModel';

import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';

export class CanaryService {

    constructor(public readonly httpRequest: BaseHttpRequest) {}

    /**
     * CreateCanary
     * Create a canary for a given domain
     * @param requestBody
     * @returns CanaryModel Document created, URL follows
     * @throws ApiError
     */
    public controllersCanaryCreateCreateCanary(
        requestBody: CreateCanaryModel,
    ): CancelablePromise<CanaryModel> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/controllers/canary/create',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request syntax or unsupported method`,
            },
        });
    }

    /**
     * GetCanary
     * Get private details about a canary
     * @param domain
     * @returns CanaryModel Request fulfilled, document follows
     * @throws ApiError
     */
    public controllersCanaryDomainGetCanary(
        domain: string,
    ): CancelablePromise<CanaryModel> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/controllers/canary/{domain}',
            path: {
                'domain': domain,
            },
            errors: {
                400: `Bad request syntax or unsupported method`,
            },
        });
    }

    /**
     * UpdateLogo
     * Update logo for given domain
     * @param domain
     * @param formData
     * @returns any Document created, URL follows
     * @throws ApiError
     */
    public controllersCanaryDomainLogoUpdateUpdateLogo(
        domain: string,
        formData: Array<Blob>,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/controllers/canary/{domain}/logo/update',
            path: {
                'domain': domain,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                400: `Bad request syntax or unsupported method`,
            },
        });
    }

    /**
     * Verify
     * Verify domain ownership via DNS
     * @param domain
     * @returns any Document created, URL follows
     * @throws ApiError
     */
    public controllersCanaryDomainVerifyVerify(
        domain: string,
    ): CancelablePromise<any> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/controllers/canary/{domain}/verify',
            path: {
                'domain': domain,
            },
            errors: {
                400: `Bad request syntax or unsupported method`,
            },
        });
    }

}
