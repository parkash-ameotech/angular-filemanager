(function(window, angular, $) {
    'use strict';
    angular.module('FileManagerApp', ['pascalprecht.translate', 'ngFileUpload', 'angularFileUpload']);

    /**
     * jQuery inits
     */
    $(window.document).on('shown.bs.modal', '.modal', function() {
        window.setTimeout(function() {
            $('[autofocus]', this).focus();
        }.bind(this), 100);
    });

    $(window.document).on('click', function() {
        $('#context-menu').hide();
    });

    $(window.document).on('contextmenu', '.main-navigation .table-files tr.item-list:has("td"), .item-list', function(e) {
        var menu = $('#context-menu');

        if (e.pageX >= window.innerWidth - menu.width()) {
            e.pageX -= menu.width();
        }
        if (e.pageY >= window.innerHeight - menu.height()) {
            e.pageY -= menu.height();
        }

        menu.hide().css({
            left: e.pageX,
            top: e.pageY
        }).appendTo('body').show();
        e.preventDefault();
    });

    if (! Array.prototype.find) {
        Array.prototype.find = function(predicate) {
            if (this == null) {
                throw new TypeError('Array.prototype.find called on null or undefined');
            }
            if (typeof predicate !== 'function') {
                throw new TypeError('predicate must be a function');
            }
            var list = Object(this);
            var length = list.length >>> 0;
            var thisArg = arguments[1];
            var value;

            for (var i = 0; i < length; i++) {
                value = list[i];
                if (predicate.call(thisArg, value, i, list)) {
                    return value;
                }
            }
            return undefined;
        };
    }
 
})(window, angular, jQuery);

(function(angular, $) {
    'use strict';
    angular.module('FileManagerApp').controller('FileManagerCtrl', [
        '$scope', '$rootScope', '$window', '$translate', 'fileManagerConfig', 'item', 'fileNavigator', 'apiMiddleware',
        'FileUploader',
        function($scope, $rootScope, $window, $translate, fileManagerConfig, Item, FileNavigator, ApiMiddleware
            ,FileUploader
        ) {

        var $storage = $window.localStorage;
        $scope.config = fileManagerConfig;
        $scope.reverse = false;
        $scope.predicate = ['model.type', 'model.name'];        
        $scope.order = function(predicate) {
            $scope.reverse = ($scope.predicate[1] === predicate) ? !$scope.reverse : false;
            $scope.predicate[1] = predicate;
        };
        $scope.query = '';
        $scope.fileNavigator = new FileNavigator();
        $scope.apiMiddleware = new ApiMiddleware();
        $scope.uploadFileList = [];
        $scope.viewTemplate = $storage.getItem('viewTemplate') || 'main-icons.html';
        $scope.fileList = [];
        $scope.temps = [];

        $scope.$watch('temps', function() {
            if ($scope.singleSelection()) {
                $scope.temp = $scope.singleSelection();
            } else {
                $scope.temp = new Item({rights: 644});
                $scope.temp.multiple = true;
            }
            $scope.temp.revert();
        });

        $scope.fileNavigator.onRefresh = function() {
            $scope.temps = [];
            $scope.query = '';
            $rootScope.selectedModalPath = $scope.fileNavigator.currentPath;
        };

        $scope.setTemplate = function(name) {
            $storage.setItem('viewTemplate', name);
            $scope.viewTemplate = name;
        };

        $scope.changeLanguage = function (locale) {
            if (locale) {
                $storage.setItem('language', locale);
                return $translate.use(locale);
            }
            $translate.use($storage.getItem('language') || fileManagerConfig.defaultLang);
        };

        $scope.isSelected = function(item) {
            return $scope.temps.indexOf(item) !== -1;
        };

        $scope.selectOrUnselect = function(item, $event) {
            var indexInTemp = $scope.temps.indexOf(item);
            var isRightClick = $event && $event.which == 3;

            if ($event && $event.target.hasAttribute('prevent')) {
                $scope.temps = [];
                return;
            }
            if (! item || (isRightClick && $scope.isSelected(item))) {
                return;
            }
            if ($event && $event.shiftKey && !isRightClick) {
                var list = $scope.fileList;
                var indexInList = list.indexOf(item);
                var lastSelected = $scope.temps[0];
                var i = list.indexOf(lastSelected);
                var current = undefined;
                if (lastSelected && list.indexOf(lastSelected) < indexInList) {
                    $scope.temps = [];
                    while (i <= indexInList) {
                        current = list[i];
                        !$scope.isSelected(current) && $scope.temps.push(current);
                        i++;
                    }
                    return;
                }
                if (lastSelected && list.indexOf(lastSelected) > indexInList) {
                    $scope.temps = [];
                    while (i >= indexInList) {
                        current = list[i];
                        !$scope.isSelected(current) && $scope.temps.push(current);
                        i--;
                    }
                    return;
                }
            }
            if ($event && !isRightClick && ($event.ctrlKey || $event.metaKey)) {
                $scope.isSelected(item) ? $scope.temps.splice(indexInTemp, 1) : $scope.temps.push(item);
                return;
            }
            $scope.temps = [item];
        };

        $scope.singleSelection = function() {
            return $scope.temps.length === 1 && $scope.temps[0];
        };

        $scope.totalSelecteds = function() {
            return {
                total: $scope.temps.length
            };
        };

        $scope.selectionHas = function(type) {
            return $scope.temps.find(function(item) {
                return item && item.model.type === type;
            });
        };

        $scope.prepareNewFolder = function() {
            var item = new Item(null, $scope.fileNavigator.currentPath);
            $scope.temps = [item];
            return item;
        };

        $scope.smartClick = function(item) {
            var pick = $scope.config.allowedActions.pickFiles;
            if (item.isFolder()) {
                return $scope.fileNavigator.folderClick(item);
            }

            if (typeof $scope.config.pickCallback === 'function' && pick) {
                var callbackSuccess = $scope.config.pickCallback(item.model);
                if (callbackSuccess === true) {
                    return;
                }
            }

            if (item.isImage()) {
                if ($scope.config.previewImagesInModal) {
                    return $scope.openImagePreview(item);
                } 
                return $scope.apiMiddleware.download(item, true);
            }
            
            if (item.isEditable()) {
                //return $scope.openEditItem(item);
            }
        };

        $scope.openImagePreview = function() {
            var item = $scope.singleSelection();
            $scope.apiMiddleware.apiHandler.inprocess = true;
            $scope.modal('imagepreview', null, true)
                .find('#imagepreview-target')
                .attr('src', $scope.apiMiddleware.getUrl(item))
                .unbind('load error')
                .on('load error', function() {
                    $scope.apiMiddleware.apiHandler.inprocess = false;
                    $scope.$apply();
                });
        };

        $scope.openEditItem = function() {
            var item = $scope.singleSelection();
            $scope.apiMiddleware.getContent(item).then(function(data) {
                item.tempModel.content = item.model.content = data.result;
            });
            $scope.modal('edit');
        };

        $scope.modal = function(id, hide, returnElement) {
            var element = $('#' + id);
            element.modal(hide ? 'hide' : 'show');
            $scope.apiMiddleware.apiHandler.error = '';
            $scope.apiMiddleware.apiHandler.asyncSuccess = false;
            return returnElement ? element : true;
        };

        $scope.modalWithPathSelector = function(id) {
            $rootScope.selectedModalPath = $scope.fileNavigator.currentPath;
            return $scope.modal(id);
        };

        $scope.isInThisPath = function(path) {
            var currentPath = $scope.fileNavigator.currentPath.join('/') + '/';
            return currentPath.indexOf(path + '/') !== -1;
        };

        $scope.edit = function() {
            $scope.apiMiddleware.edit($scope.singleSelection()).then(function() {
                $scope.modal('edit', true);
            });
        };

        $scope.changePermissions = function() {
            $scope.apiMiddleware.changePermissions($scope.temps, $scope.temp).then(function() {
                $scope.modal('changepermissions', true);
            });
        };

        $scope.download = function() {

            var item = $scope.singleSelection();
            if ($scope.selectionHas('dir')) {
                return;
            }
            if (item) {
                return $scope.apiMiddleware.download(item);
            }
            return $scope.apiMiddleware.downloadMultiple($scope.temps);
        };

        $scope.copy = function() {
            var item = $scope.singleSelection();
            if (item) {
                var name = item.tempModel.name.trim();
                var nameExists = $scope.fileNavigator.fileNameExists(name);
                if (nameExists && validateSamePath(item)) {
                    $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                    return false;
                }
                if (!name) {
                    $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                    return false;
                }
            }
            $scope.apiMiddleware.copy($scope.temps, $rootScope.selectedModalPath).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('copy', true);
            });
        };

        $scope.compress = function() {
            var name = $scope.temp.tempModel.name.trim();
            var nameExists = $scope.fileNavigator.fileNameExists(name);

            if (nameExists && validateSamePath($scope.temp)) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                return false;
            }
            if (!name) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                return false;
            }

            $scope.apiMiddleware.compress($scope.temps, name, $rootScope.selectedModalPath).then(function() {
                $scope.fileNavigator.refresh();
                if (! $scope.config.compressAsync) {
                    return $scope.modal('compress', true);
                }
                $scope.apiMiddleware.apiHandler.asyncSuccess = true;
            }, function() {
                $scope.apiMiddleware.apiHandler.asyncSuccess = false;
            });
        };

        $scope.extract = function() {
            var item = $scope.temp;
            var name = $scope.temp.tempModel.name.trim();
            var nameExists = $scope.fileNavigator.fileNameExists(name);

            if (nameExists && validateSamePath($scope.temp)) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                return false;
            }
            if (!name) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                return false;
            }

            $scope.apiMiddleware.extract(item, name, $rootScope.selectedModalPath).then(function() {
                $scope.fileNavigator.refresh();
                if (! $scope.config.extractAsync) {
                    return $scope.modal('extract', true);
                }
                $scope.apiMiddleware.apiHandler.asyncSuccess = true;
            }, function() {
                $scope.apiMiddleware.apiHandler.asyncSuccess = false;
            });
        };

        $scope.remove = function() {
            $scope.apiMiddleware.remove($scope.temps).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('remove', true);
            });
        };

        $scope.move = function() {           
            var anyItem = $scope.singleSelection() || $scope.temps[0];
            if (anyItem && validateSamePath(anyItem)) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_cannot_move_same_path');
                return false;
            }
            $scope.apiMiddleware.move($scope.temps, $rootScope.selectedModalPath).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('move', true);
            });
        };

        $scope.rename = function() {
            var item = $scope.singleSelection();
            var name = item.tempModel.name;
            var samePath = item.tempModel.path.join('') === item.model.path.join('');
            if (!name || (samePath && $scope.fileNavigator.fileNameExists(name))) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                return false;
            }
            $scope.apiMiddleware.rename(item).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('rename', true);
            });
        };

        $scope.createFolder = function() {
            var item = $scope.singleSelection();
            var name = item.tempModel.name;
            if (!name || $scope.fileNavigator.fileNameExists(name)) {
                return $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
            }
            $scope.apiMiddleware.createFolder(item).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('newfolder', true);
            });
        };

        $scope.addForUpload = function($files) {
            $scope.uploadFileList = $scope.uploadFileList.concat($files);
            $scope.modal('uploadfile');
        };

        $scope.removeFromUpload = function(index) {
            $scope.apiMiddleware.removeFromUploadForm($scope.uploadFileList[index]).then(function() {
                $scope.uploadFileList.splice(index, 1);
            });
        };

        $scope.uploadFiles = function() {
            $scope.fileNavigator.refresh();
            $scope.uploadFileList = [];
            $scope.modal('uploadfile', true);
            /*$scope.apiMiddleware.upload($scope.uploadFileList, $scope.fileNavigator.currentPath).then(function() {
                $scope.fileNavigator.refresh();
                $scope.uploadFileList = [];
                $scope.modal('uploadfile', true);
            }, function(data) {
                var errorMsg = data.result && data.result.error || $translate.instant('error_uploading_files');
                $scope.apiMiddleware.apiHandler.error = errorMsg;
            });*/
        };

        var validateSamePath = function(item) {
            var selectedPath = $rootScope.selectedModalPath.join('');
            var selectedItemsPath = item && item.model.path.join('');
            return selectedItemsPath === selectedPath;
        };

        var getQueryParam = function(param) {
            var found = $window.location.search.substr(1).split('&').filter(function(item) {
                return param ===  item.split('=')[0];
            });
            return found[0] && found[0].split('=')[1] || undefined;
        };

        $scope.changeLanguage(getQueryParam('lang'));
        $scope.isWindows = getQueryParam('server') === 'Windows';
        $scope.fileNavigator.refresh();

            var uploader = $scope.uploader = new FileUploader({
                url: '/api/filemanager/uploadUrl',
                autoUpload: true
            });

            uploader.onBeforeUploadItem = function (item) {
                //console.log($scope.fileNavigator.currentPath);
                item.formData.push({name: item.file.name, size: item.file.size / 1024, path: $scope.fileNavigator.currentPath.join('/')});

            };

            uploader.onCompleteItem = function (item, response) {
                //console.log(response);
                $scope.uploadFileList.push(response.data);
                $scope.fileNavigator.refresh();
                uploader.clearQueue();
                $scope.showUploadBar = false;
            }


            uploader.onAfterAddingFile = function(fileItem) {
                $scope.showUploadBar = true;
            };


    }]);
})(angular, jQuery);

(function(angular) {
    'use strict';
    angular.module('FileManagerApp').controller('ModalFileManagerCtrl', 
        ['$scope', '$rootScope', 'fileNavigator', function($scope, $rootScope, FileNavigator) {

        $scope.reverse = false;
        $scope.predicate = ['model.type', 'model.name'];
        $scope.fileNavigator = new FileNavigator();
        $rootScope.selectedModalPath = [];

        $scope.order = function(predicate) {
            $scope.reverse = ($scope.predicate[1] === predicate) ? !$scope.reverse : false;
            $scope.predicate[1] = predicate;
        };

        $scope.select = function(item) {
            $rootScope.selectedModalPath = item.model.fullPath().split('/').filter(Boolean);
            $scope.modal('selector', true);
        };

        $scope.selectCurrent = function() {
            $rootScope.selectedModalPath = $scope.fileNavigator.currentPath;
            $scope.modal('selector', true);
        };

        $scope.selectedFilesAreChildOfPath = function(item) {
            var path = item.model.fullPath();
            return $scope.temps.find(function(item) {
                var itemPath = item.model.fullPath();
                if (path == itemPath) {
                    return true;
                }
                /*
                if (path.startsWith(itemPath)) {
                    fixme names in same folder like folder-one and folder-one-two
                    at the moment fixed hidding affected folders
                }
                */
            });
        };

        $rootScope.openNavigator = function(path) {
            $scope.fileNavigator.currentPath = path;
            $scope.fileNavigator.refresh();
            $scope.modal('selector');
        };

        $rootScope.getSelectedPath = function() {
            var path = $rootScope.selectedModalPath.filter(Boolean);
            var result = '/' + path.join('/');
            if ($scope.singleSelection() && !$scope.singleSelection().isFolder()) {
                result += '/' + $scope.singleSelection().tempModel.name;
            }
            return result.replace(/\/\//, '/');
        };

    }]);
})(angular);

(function(angular) {
    'use strict';
    var app = angular.module('FileManagerApp');

    app.directive('angularFilemanager', ['$parse', 'fileManagerConfig', function($parse, fileManagerConfig) {
        return {
            restrict: 'EA',
            templateUrl: fileManagerConfig.tplPath + '/main.html'
        };
    }]);

    app.directive('ngFile', ['$parse', function($parse) {
        return {
            restrict: 'A',
            link: function(scope, element, attrs) {
                var model = $parse(attrs.ngFile);
                var modelSetter = model.assign;

                element.bind('change', function() {
                    scope.$apply(function() {
                        modelSetter(scope, element[0].files);
                    });
                });
            }
        };
    }]);

    app.directive('ngRightClick', ['$parse', function($parse) {
        return function(scope, element, attrs) {
            var fn = $parse(attrs.ngRightClick);
            element.bind('contextmenu', function(event) {
                scope.$apply(function() {
                    event.preventDefault();
                    fn(scope, {$event: event});
                });
            });
        };
    }]);
    
})(angular);

(function(angular) {
    'use strict';
    angular.module('FileManagerApp').service('chmod', function () {

        var Chmod = function(initValue) {
            this.owner = this.getRwxObj();
            this.group = this.getRwxObj();
            this.others = this.getRwxObj();

            if (initValue) {
                var codes = isNaN(initValue) ?
                    this.convertfromCode(initValue):
                    this.convertfromOctal(initValue);

                if (! codes) {
                    throw new Error('Invalid chmod input data (%s)'.replace('%s', initValue));
                }

                this.owner = codes.owner;
                this.group = codes.group;
                this.others = codes.others;
            }
        };

        Chmod.prototype.toOctal = function(prepend, append) {
            var result = [];
            ['owner', 'group', 'others'].forEach(function(key, i) {
                result[i]  = this[key].read  && this.octalValues.read  || 0;
                result[i] += this[key].write && this.octalValues.write || 0;
                result[i] += this[key].exec  && this.octalValues.exec  || 0;
            }.bind(this));
            return (prepend||'') + result.join('') + (append||'');
        };

        Chmod.prototype.toCode = function(prepend, append) {
            var result = [];
            ['owner', 'group', 'others'].forEach(function(key, i) {
                result[i]  = this[key].read  && this.codeValues.read  || '-';
                result[i] += this[key].write && this.codeValues.write || '-';
                result[i] += this[key].exec  && this.codeValues.exec  || '-';
            }.bind(this));
            return (prepend||'') + result.join('') + (append||'');
        };

        Chmod.prototype.getRwxObj = function() {
            return {
                read: false,
                write: false,
                exec: false
            };
        };

        Chmod.prototype.octalValues = {
            read: 4, write: 2, exec: 1
        };

        Chmod.prototype.codeValues = {
            read: 'r', write: 'w', exec: 'x'
        };

        Chmod.prototype.convertfromCode = function (str) {
            str = ('' + str).replace(/\s/g, '');
            str = str.length === 10 ? str.substr(1) : str;
            if (! /^[-rwxts]{9}$/.test(str)) {
                return;
            }

            var result = [], vals = str.match(/.{1,3}/g);
            for (var i in vals) {
                var rwxObj = this.getRwxObj();
                rwxObj.read  = /r/.test(vals[i]);
                rwxObj.write = /w/.test(vals[i]);
                rwxObj.exec  = /x|t/.test(vals[i]);
                result.push(rwxObj);
            }

            return {
                owner : result[0],
                group : result[1],
                others: result[2]
            };
        };

        Chmod.prototype.convertfromOctal = function (str) {
            str = ('' + str).replace(/\s/g, '');
            str = str.length === 4 ? str.substr(1) : str;
            if (! /^[0-7]{3}$/.test(str)) {
                return;
            }

            var result = [], vals = str.match(/.{1}/g);
            for (var i in vals) {
                var rwxObj = this.getRwxObj();
                rwxObj.read  = /[4567]/.test(vals[i]);
                rwxObj.write = /[2367]/.test(vals[i]);
                rwxObj.exec  = /[1357]/.test(vals[i]);
                result.push(rwxObj);
            }

            return {
                owner : result[0],
                group : result[1],
                others: result[2]
            };
        };

        return Chmod;
    });
})(angular);
(function(angular) {
    'use strict';
    angular.module('FileManagerApp').factory('item', ['fileManagerConfig', 'chmod', function(fileManagerConfig, Chmod) {

        var Item = function(model, path) {
            var rawModel = {
                name: model && model.name || '',
                path: path || [],
                type: model && model.type || 'file',
                id: model && model.id || '',
                size: model && parseInt(model.size || 0),
                date: parseMySQLDate(model && model.date),
                perms: new Chmod(model && model.rights),
                content: model && model.content || '',
                recursive: false,
                fullPath: function() {
                    var path = this.path.filter(Boolean);
                    return ('/' + path.join('/') + '/' + this.name).replace(/\/\//, '/');
                }
            };

            this.error = '';
            this.processing = false;

            this.model = angular.copy(rawModel);
            this.tempModel = angular.copy(rawModel);

            function parseMySQLDate(mysqlDate) {
                var d = (mysqlDate || '').toString().split(/[- :]/);
                return new Date(d[0], d[1] - 1, d[2], d[3], d[4], d[5]);
            }
        };

        Item.prototype.update = function() {
            angular.extend(this.model, angular.copy(this.tempModel));
        };

        Item.prototype.revert = function() {
            angular.extend(this.tempModel, angular.copy(this.model));
            this.error = '';
        };

        Item.prototype.isFolder = function() {
            return this.model.type === 'dir';
        };

        Item.prototype.isEditable = function() {
            return !this.isFolder() && fileManagerConfig.isEditableFilePattern.test(this.model.name);
        };

        Item.prototype.isImage = function() {
            return fileManagerConfig.isImageFilePattern.test(this.model.name);
        };

        Item.prototype.isCompressible = function() {
            return this.isFolder();
        };

        Item.prototype.isExtractable = function() {
            return !this.isFolder() && fileManagerConfig.isExtractableFilePattern.test(this.model.name);
        };

        Item.prototype.isSelectable = function() {
            return (this.isFolder() && fileManagerConfig.allowedActions.pickFolders) || (!this.isFolder() && fileManagerConfig.allowedActions.pickFiles);
        };

        return Item;
    }]);
})(angular);
/*
 angular-file-upload v1.1.5
 https://github.com/nervgh/angular-file-upload
*/
(function(angular, factory) {
    if (typeof define === 'function' && define.amd) {
        define('angular-file-upload', ['angular'], function(angular) {
            return factory(angular);
        });
    } else {
        return factory(angular);
    }
}(typeof angular === 'undefined' ? null : angular, function(angular) {

var module = angular.module('angularFileUpload', []);

'use strict';

/**
 * Classes
 *
 * FileUploader
 * FileUploader.FileLikeObject
 * FileUploader.FileItem
 * FileUploader.FileDirective
 * FileUploader.FileSelect
 * FileUploader.FileDrop
 * FileUploader.FileOver
 */

module


    .value('fileUploaderOptions', {
        url: '/',
        alias: 'file',
        headers: {},
        queue: [],
        progress: 0,
        autoUpload: false,
        removeAfterUpload: false,
        method: 'POST',
        filters: [],
        formData: [],
        queueLimit: Number.MAX_VALUE,
        withCredentials: false
    })


    .factory('FileUploader', ['fileUploaderOptions', '$rootScope', '$http', '$window', '$compile',
        function(fileUploaderOptions, $rootScope, $http, $window, $compile) {
            /**
             * Creates an instance of FileUploader
             * @param {Object} [options]
             * @constructor
             */
            function FileUploader(options) {
                var settings = angular.copy(fileUploaderOptions);
                angular.extend(this, settings, options, {
                    isUploading: false,
                    _nextIndex: 0,
                    _failFilterIndex: -1,
                    _directives: {select: [], drop: [], over: []}
                });

                // add default filters
                this.filters.unshift({name: 'queueLimit', fn: this._queueLimitFilter});
                this.filters.unshift({name: 'folder', fn: this._folderFilter});
            }
            /**********************
             * PUBLIC
             **********************/
            /**
             * Checks a support the html5 uploader
             * @returns {Boolean}
             * @readonly
             */
            FileUploader.prototype.isHTML5 = !!($window.File && $window.FormData);
            /**
             * Adds items to the queue
             * @param {File|HTMLInputElement|Object|FileList|Array<Object>} files
             * @param {Object} [options]
             * @param {Array<Function>|String} filters
             */
            FileUploader.prototype.addToQueue = function(files, options, filters) {
                var list = this.isArrayLikeObject(files) ? files: [files];
                var arrayOfFilters = this._getFilters(filters);
                var count = this.queue.length;
                var addedFileItems = [];

                angular.forEach(list, function(some /*{File|HTMLInputElement|Object}*/) {
                    var temp = new FileUploader.FileLikeObject(some);

                    if (this._isValidFile(temp, arrayOfFilters, options)) {
                        var fileItem = new FileUploader.FileItem(this, some, options);
                        addedFileItems.push(fileItem);
                        this.queue.push(fileItem);
                        this._onAfterAddingFile(fileItem);
                    } else {
                        var filter = this.filters[this._failFilterIndex];
                        this._onWhenAddingFileFailed(temp, filter, options);
                    }
                }, this);

                if(this.queue.length !== count) {
                    this._onAfterAddingAll(addedFileItems);
                    this.progress = this._getTotalProgress();
                }

                this._render();
                if (this.autoUpload) this.uploadAll();
            };
            /**
             * Remove items from the queue. Remove last: index = -1
             * @param {FileItem|Number} value
             */
            FileUploader.prototype.removeFromQueue = function(value) {
                var index = this.getIndexOfItem(value);
                var item = this.queue[index];
                if (item.isUploading) item.cancel();
                this.queue.splice(index, 1);
                item._destroy();
                this.progress = this._getTotalProgress();
            };
            /**
             * Clears the queue
             */
            FileUploader.prototype.clearQueue = function() {
                while(this.queue.length) {
                    this.queue[0].remove();
                }
                this.progress = 0;
            };
            /**
             * Uploads a item from the queue
             * @param {FileItem|Number} value
             */
            FileUploader.prototype.uploadItem = function(value) {
                var index = this.getIndexOfItem(value);
                var item = this.queue[index];
                var transport = this.isHTML5 ? '_xhrTransport' : '_iframeTransport';

                item._prepareToUploading();
                if(this.isUploading) return;

                this.isUploading = true;
                this[transport](item);
            };
            /**
             * Cancels uploading of item from the queue
             * @param {FileItem|Number} value
             */
            FileUploader.prototype.cancelItem = function(value) {
                var index = this.getIndexOfItem(value);
                var item = this.queue[index];
                var prop = this.isHTML5 ? '_xhr' : '_form';
                if (item && item.isUploading) item[prop].abort();
            };
            /**
             * Uploads all not uploaded items of queue
             */
            FileUploader.prototype.uploadAll = function() {
                var items = this.getNotUploadedItems().filter(function(item) {
                    return !item.isUploading;
                });
                if (!items.length) return;

                angular.forEach(items, function(item) {
                    item._prepareToUploading();
                });
                items[0].upload();
            };
            /**
             * Cancels all uploads
             */
            FileUploader.prototype.cancelAll = function() {
                var items = this.getNotUploadedItems();
                angular.forEach(items, function(item) {
                    item.cancel();
                });
            };
            /**
             * Returns "true" if value an instance of File
             * @param {*} value
             * @returns {Boolean}
             * @private
             */
            FileUploader.prototype.isFile = function(value) {
                var fn = $window.File;
                return (fn && value instanceof fn);
            };
            /**
             * Returns "true" if value an instance of FileLikeObject
             * @param {*} value
             * @returns {Boolean}
             * @private
             */
            FileUploader.prototype.isFileLikeObject = function(value) {
                return value instanceof FileUploader.FileLikeObject;
            };
            /**
             * Returns "true" if value is array like object
             * @param {*} value
             * @returns {Boolean}
             */
            FileUploader.prototype.isArrayLikeObject = function(value) {
                return (angular.isObject(value) && 'length' in value);
            };
            /**
             * Returns a index of item from the queue
             * @param {Item|Number} value
             * @returns {Number}
             */
            FileUploader.prototype.getIndexOfItem = function(value) {
                return angular.isNumber(value) ? value : this.queue.indexOf(value);
            };
            /**
             * Returns not uploaded items
             * @returns {Array}
             */
            FileUploader.prototype.getNotUploadedItems = function() {
                return this.queue.filter(function(item) {
                    return !item.isUploaded;
                });
            };
            /**
             * Returns items ready for upload
             * @returns {Array}
             */
            FileUploader.prototype.getReadyItems = function() {
                return this.queue
                    .filter(function(item) {
                        return (item.isReady && !item.isUploading);
                    })
                    .sort(function(item1, item2) {
                        return item1.index - item2.index;
                    });
            };
            /**
             * Destroys instance of FileUploader
             */
            FileUploader.prototype.destroy = function() {
                angular.forEach(this._directives, function(key) {
                    angular.forEach(this._directives[key], function(object) {
                        object.destroy();
                    }, this);
                }, this);
            };
            /**
             * Callback
             * @param {Array} fileItems
             */
            FileUploader.prototype.onAfterAddingAll = function(fileItems) {};
            /**
             * Callback
             * @param {FileItem} fileItem
             */
            FileUploader.prototype.onAfterAddingFile = function(fileItem) {};
            /**
             * Callback
             * @param {File|Object} item
             * @param {Object} filter
             * @param {Object} options
             * @private
             */
            FileUploader.prototype.onWhenAddingFileFailed = function(item, filter, options) {};
            /**
             * Callback
             * @param {FileItem} fileItem
             */
            FileUploader.prototype.onBeforeUploadItem = function(fileItem) {};
            /**
             * Callback
             * @param {FileItem} fileItem
             * @param {Number} progress
             */
            FileUploader.prototype.onProgressItem = function(fileItem, progress) {};
            /**
             * Callback
             * @param {Number} progress
             */
            FileUploader.prototype.onProgressAll = function(progress) {};
            /**
             * Callback
             * @param {FileItem} item
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             */
            FileUploader.prototype.onSuccessItem = function(item, response, status, headers) {};
            /**
             * Callback
             * @param {FileItem} item
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             */
            FileUploader.prototype.onErrorItem = function(item, response, status, headers) {};
            /**
             * Callback
             * @param {FileItem} item
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             */
            FileUploader.prototype.onCancelItem = function(item, response, status, headers) {};
            /**
             * Callback
             * @param {FileItem} item
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             */
            FileUploader.prototype.onCompleteItem = function(item, response, status, headers) {};
            /**
             * Callback
             */
            FileUploader.prototype.onCompleteAll = function() {};
            /**********************
             * PRIVATE
             **********************/
            /**
             * Returns the total progress
             * @param {Number} [value]
             * @returns {Number}
             * @private
             */
            FileUploader.prototype._getTotalProgress = function(value) {
                if(this.removeAfterUpload) return value || 0;

                var notUploaded = this.getNotUploadedItems().length;
                var uploaded = notUploaded ? this.queue.length - notUploaded : this.queue.length;
                var ratio = 100 / this.queue.length;
                var current = (value || 0) * ratio / 100;

                return Math.round(uploaded * ratio + current);
            };
            /**
             * Returns array of filters
             * @param {Array<Function>|String} filters
             * @returns {Array<Function>}
             * @private
             */
            FileUploader.prototype._getFilters = function(filters) {
                if (angular.isUndefined(filters)) return this.filters;
                if (angular.isArray(filters)) return filters;
                var names = filters.match(/[^\s,]+/g);
                return this.filters.filter(function(filter) {
                    return names.indexOf(filter.name) !== -1;
                }, this);
            };
            /**
             * Updates html
             * @private
             */
            FileUploader.prototype._render = function() {
                if (!$rootScope.$$phase) $rootScope.$apply();
            };
            /**
             * Returns "true" if item is a file (not folder)
             * @param {File|FileLikeObject} item
             * @returns {Boolean}
             * @private
             */
            FileUploader.prototype._folderFilter = function(item) {
                return !!(item.size || item.type);
            };
            /**
             * Returns "true" if the limit has not been reached
             * @returns {Boolean}
             * @private
             */
            FileUploader.prototype._queueLimitFilter = function() {
                return this.queue.length < this.queueLimit;
            };
            /**
             * Returns "true" if file pass all filters
             * @param {File|Object} file
             * @param {Array<Function>} filters
             * @param {Object} options
             * @returns {Boolean}
             * @private
             */
            FileUploader.prototype._isValidFile = function(file, filters, options) {
                this._failFilterIndex = -1;
                return !filters.length ? true : filters.every(function(filter) {
                    this._failFilterIndex++;
                    return filter.fn.call(this, file, options);
                }, this);
            };
            /**
             * Checks whether upload successful
             * @param {Number} status
             * @returns {Boolean}
             * @private
             */
            FileUploader.prototype._isSuccessCode = function(status) {
                return (status >= 200 && status < 300) || status === 304;
            };
            /**
             * Transforms the server response
             * @param {*} response
             * @param {Object} headers
             * @returns {*}
             * @private
             */
            FileUploader.prototype._transformResponse = function(response, headers) {
                var headersGetter = this._headersGetter(headers);
                angular.forEach($http.defaults.transformResponse, function(transformFn) {
                    response = transformFn(response, headersGetter);
                });
                return response;
            };
            /**
             * Parsed response headers
             * @param headers
             * @returns {Object}
             * @see https://github.com/angular/angular.js/blob/master/src/ng/http.js
             * @private
             */
            FileUploader.prototype._parseHeaders = function(headers) {
                var parsed = {}, key, val, i;

                if (!headers) return parsed;

                angular.forEach(headers.split('\n'), function(line) {
                    i = line.indexOf(':');
                    key = line.slice(0, i).trim().toLowerCase();
                    val = line.slice(i + 1).trim();

                    if (key) {
                        parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
                    }
                });

                return parsed;
            };
            /**
             * Returns function that returns headers
             * @param {Object} parsedHeaders
             * @returns {Function}
             * @private
             */
            FileUploader.prototype._headersGetter = function(parsedHeaders) {
                return function(name) {
                    if (name) {
                        return parsedHeaders[name.toLowerCase()] || null;
                    }
                    return parsedHeaders;
                };
            };
            /**
             * The XMLHttpRequest transport
             * @param {FileItem} item
             * @private
             */
            FileUploader.prototype._xhrTransport = function(item) {
                var xhr = item._xhr = new XMLHttpRequest();
                var form = new FormData();
                var that = this;

                that._onBeforeUploadItem(item);

                angular.forEach(item.formData, function(obj) {
                    angular.forEach(obj, function(value, key) {
                        form.append(key, value);
                    });
                });

                form.append(item.alias, item._file, item.file.name);

                xhr.upload.onprogress = function(event) {
                    var progress = Math.round(event.lengthComputable ? event.loaded * 100 / event.total : 0);
                    that._onProgressItem(item, progress);
                };

                xhr.onload = function() {
                    var headers = that._parseHeaders(xhr.getAllResponseHeaders());
                    var response = that._transformResponse(xhr.response, headers);
                    var gist = that._isSuccessCode(xhr.status) ? 'Success' : 'Error';
                    var method = '_on' + gist + 'Item';
                    that[method](item, response, xhr.status, headers);
                    that._onCompleteItem(item, response, xhr.status, headers);
                };

                xhr.onerror = function() {
                    var headers = that._parseHeaders(xhr.getAllResponseHeaders());
                    var response = that._transformResponse(xhr.response, headers);
                    that._onErrorItem(item, response, xhr.status, headers);
                    that._onCompleteItem(item, response, xhr.status, headers);
                };

                xhr.onabort = function() {
                    var headers = that._parseHeaders(xhr.getAllResponseHeaders());
                    var response = that._transformResponse(xhr.response, headers);
                    that._onCancelItem(item, response, xhr.status, headers);
                    that._onCompleteItem(item, response, xhr.status, headers);
                };

                xhr.open(item.method, item.url, true);

                xhr.withCredentials = item.withCredentials;

                angular.forEach(item.headers, function(value, name) {
                    xhr.setRequestHeader(name, value);
                });

                xhr.send(form);
                this._render();
            };
            /**
             * The IFrame transport
             * @param {FileItem} item
             * @private
             */
            FileUploader.prototype._iframeTransport = function(item) {
                var form = angular.element('<form style="display: none;" />');
                var iframe = angular.element('<iframe name="iframeTransport' + Date.now() + '">');
                var input = item._input;
                var that = this;

                if (item._form) item._form.replaceWith(input); // remove old form
                item._form = form; // save link to new form

                that._onBeforeUploadItem(item);

                input.prop('name', item.alias);

                angular.forEach(item.formData, function(obj) {
                    angular.forEach(obj, function(value, key) {
                        var element = angular.element('<input type="hidden" name="' + key + '" />');
                        element.val(value);
                        form.append(element);
                    });
                });

                form.prop({
                    action: item.url,
                    method: 'POST',
                    target: iframe.prop('name'),
                    enctype: 'multipart/form-data',
                    encoding: 'multipart/form-data' // old IE
                });

                iframe.bind('load', function() {
                    try {
                        // Fix for legacy IE browsers that loads internal error page
                        // when failed WS response received. In consequence iframe
                        // content access denied error is thrown becouse trying to
                        // access cross domain page. When such thing occurs notifying
                        // with empty response object. See more info at:
                        // http://stackoverflow.com/questions/151362/access-is-denied-error-on-accessing-iframe-document-object
                        // Note that if non standard 4xx or 5xx error code returned
                        // from WS then response content can be accessed without error
                        // but 'XHR' status becomes 200. In order to avoid confusion
                        // returning response via same 'success' event handler.

                        // fixed angular.contents() for iframes
                        var html = iframe[0].contentDocument.body.innerHTML;
                    } catch (e) {}

                    var xhr = {response: html, status: 200, dummy: true};
                    var headers = {};
                    var response = that._transformResponse(xhr.response, headers);

                    that._onSuccessItem(item, response, xhr.status, headers);
                    that._onCompleteItem(item, response, xhr.status, headers);
                });

                form.abort = function() {
                    var xhr = {status: 0, dummy: true};
                    var headers = {};
                    var response;

                    iframe.unbind('load').prop('src', 'javascript:false;');
                    form.replaceWith(input);

                    that._onCancelItem(item, response, xhr.status, headers);
                    that._onCompleteItem(item, response, xhr.status, headers);
                };

                input.after(form);
                form.append(input).append(iframe);

                form[0].submit();
                this._render();
            };
            /**
             * Inner callback
             * @param {File|Object} item
             * @param {Object} filter
             * @param {Object} options
             * @private
             */
            FileUploader.prototype._onWhenAddingFileFailed = function(item, filter, options) {
                this.onWhenAddingFileFailed(item, filter, options);
            };
            /**
             * Inner callback
             * @param {FileItem} item
             */
            FileUploader.prototype._onAfterAddingFile = function(item) {
                this.onAfterAddingFile(item);
            };
            /**
             * Inner callback
             * @param {Array<FileItem>} items
             */
            FileUploader.prototype._onAfterAddingAll = function(items) {
                this.onAfterAddingAll(items);
            };
            /**
             *  Inner callback
             * @param {FileItem} item
             * @private
             */
            FileUploader.prototype._onBeforeUploadItem = function(item) {
                item._onBeforeUpload();
                this.onBeforeUploadItem(item);
            };
            /**
             * Inner callback
             * @param {FileItem} item
             * @param {Number} progress
             * @private
             */
            FileUploader.prototype._onProgressItem = function(item, progress) {
                var total = this._getTotalProgress(progress);
                this.progress = total;
                item._onProgress(progress);
                this.onProgressItem(item, progress);
                this.onProgressAll(total);
                this._render();
            };
            /**
             * Inner callback
             * @param {FileItem} item
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             * @private
             */
            FileUploader.prototype._onSuccessItem = function(item, response, status, headers) {
                item._onSuccess(response, status, headers);
                this.onSuccessItem(item, response, status, headers);
            };
            /**
             * Inner callback
             * @param {FileItem} item
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             * @private
             */
            FileUploader.prototype._onErrorItem = function(item, response, status, headers) {
                item._onError(response, status, headers);
                this.onErrorItem(item, response, status, headers);
            };
            /**
             * Inner callback
             * @param {FileItem} item
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             * @private
             */
            FileUploader.prototype._onCancelItem = function(item, response, status, headers) {
                item._onCancel(response, status, headers);
                this.onCancelItem(item, response, status, headers);
            };
            /**
             * Inner callback
             * @param {FileItem} item
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             * @private
             */
            FileUploader.prototype._onCompleteItem = function(item, response, status, headers) {
                item._onComplete(response, status, headers);
                this.onCompleteItem(item, response, status, headers);

                var nextItem = this.getReadyItems()[0];
                this.isUploading = false;

                if(angular.isDefined(nextItem)) {
                    nextItem.upload();
                    return;
                }

                this.onCompleteAll();
                this.progress = this._getTotalProgress();
                this._render();
            };
            /**********************
             * STATIC
             **********************/
            /**
             * @borrows FileUploader.prototype.isFile
             */
            FileUploader.isFile = FileUploader.prototype.isFile;
            /**
             * @borrows FileUploader.prototype.isFileLikeObject
             */
            FileUploader.isFileLikeObject = FileUploader.prototype.isFileLikeObject;
            /**
             * @borrows FileUploader.prototype.isArrayLikeObject
             */
            FileUploader.isArrayLikeObject = FileUploader.prototype.isArrayLikeObject;
            /**
             * @borrows FileUploader.prototype.isHTML5
             */
            FileUploader.isHTML5 = FileUploader.prototype.isHTML5;
            /**
             * Inherits a target (Class_1) by a source (Class_2)
             * @param {Function} target
             * @param {Function} source
             */
            FileUploader.inherit = function(target, source) {
                target.prototype = Object.create(source.prototype);
                target.prototype.constructor = target;
                target.super_ = source;
            };
            FileUploader.FileLikeObject = FileLikeObject;
            FileUploader.FileItem = FileItem;
            FileUploader.FileDirective = FileDirective;
            FileUploader.FileSelect = FileSelect;
            FileUploader.FileDrop = FileDrop;
            FileUploader.FileOver = FileOver;

            // ---------------------------

            /**
             * Creates an instance of FileLikeObject
             * @param {File|HTMLInputElement|Object} fileOrInput
             * @constructor
             */
            function FileLikeObject(fileOrInput) {
                var isInput = angular.isElement(fileOrInput);
                var fakePathOrObject = isInput ? fileOrInput.value : fileOrInput;
                var postfix = angular.isString(fakePathOrObject) ? 'FakePath' : 'Object';
                var method = '_createFrom' + postfix;
                this[method](fakePathOrObject);
            }

            /**
             * Creates file like object from fake path string
             * @param {String} path
             * @private
             */
            FileLikeObject.prototype._createFromFakePath = function(path) {
                this.lastModifiedDate = null;
                this.size = null;
                this.type = 'like/' + path.slice(path.lastIndexOf('.') + 1).toLowerCase();
                this.name = path.slice(path.lastIndexOf('/') + path.lastIndexOf('\\') + 2);
            };
            /**
             * Creates file like object from object
             * @param {File|FileLikeObject} object
             * @private
             */
            FileLikeObject.prototype._createFromObject = function(object) {
                this.lastModifiedDate = angular.copy(object.lastModifiedDate);
                this.size = object.size;
                this.type = object.type;
                this.name = object.name;
            };

            // ---------------------------

            /**
             * Creates an instance of FileItem
             * @param {FileUploader} uploader
             * @param {File|HTMLInputElement|Object} some
             * @param {Object} options
             * @constructor
             */
            function FileItem(uploader, some, options) {
                var isInput = angular.isElement(some);
                var input = isInput ? angular.element(some) : null;
                var file = !isInput ? some : null;

                angular.extend(this, {
                    url: uploader.url,
                    alias: uploader.alias,
                    headers: angular.copy(uploader.headers),
                    formData: angular.copy(uploader.formData),
                    removeAfterUpload: uploader.removeAfterUpload,
                    withCredentials: uploader.withCredentials,
                    method: uploader.method
                }, options, {
                    uploader: uploader,
                    file: new FileUploader.FileLikeObject(some),
                    isReady: false,
                    isUploading: false,
                    isUploaded: false,
                    isSuccess: false,
                    isCancel: false,
                    isError: false,
                    progress: 0,
                    index: null,
                    _file: file,
                    _input: input
                });

                if (input) this._replaceNode(input);
            }
            /**********************
             * PUBLIC
             **********************/
            /**
             * Uploads a FileItem
             */
            FileItem.prototype.upload = function() {
                this.uploader.uploadItem(this);
            };
            /**
             * Cancels uploading of FileItem
             */
            FileItem.prototype.cancel = function() {
                this.uploader.cancelItem(this);
            };
            /**
             * Removes a FileItem
             */
            FileItem.prototype.remove = function() {
                this.uploader.removeFromQueue(this);
            };
            /**
             * Callback
             * @private
             */
            FileItem.prototype.onBeforeUpload = function() {};
            /**
             * Callback
             * @param {Number} progress
             * @private
             */
            FileItem.prototype.onProgress = function(progress) {};
            /**
             * Callback
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             */
            FileItem.prototype.onSuccess = function(response, status, headers) {};
            /**
             * Callback
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             */
            FileItem.prototype.onError = function(response, status, headers) {};
            /**
             * Callback
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             */
            FileItem.prototype.onCancel = function(response, status, headers) {};
            /**
             * Callback
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             */
            FileItem.prototype.onComplete = function(response, status, headers) {};
            /**********************
             * PRIVATE
             **********************/
            /**
             * Inner callback
             */
            FileItem.prototype._onBeforeUpload = function() {
                this.isReady = true;
                this.isUploading = true;
                this.isUploaded = false;
                this.isSuccess = false;
                this.isCancel = false;
                this.isError = false;
                this.progress = 0;
                this.onBeforeUpload();
            };
            /**
             * Inner callback
             * @param {Number} progress
             * @private
             */
            FileItem.prototype._onProgress = function(progress) {
                this.progress = progress;
                this.onProgress(progress);
            };
            /**
             * Inner callback
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             * @private
             */
            FileItem.prototype._onSuccess = function(response, status, headers) {
                this.isReady = false;
                this.isUploading = false;
                this.isUploaded = true;
                this.isSuccess = true;
                this.isCancel = false;
                this.isError = false;
                this.progress = 100;
                this.index = null;
                this.onSuccess(response, status, headers);
            };
            /**
             * Inner callback
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             * @private
             */
            FileItem.prototype._onError = function(response, status, headers) {
                this.isReady = false;
                this.isUploading = false;
                this.isUploaded = true;
                this.isSuccess = false;
                this.isCancel = false;
                this.isError = true;
                this.progress = 0;
                this.index = null;
                this.onError(response, status, headers);
            };
            /**
             * Inner callback
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             * @private
             */
            FileItem.prototype._onCancel = function(response, status, headers) {
                this.isReady = false;
                this.isUploading = false;
                this.isUploaded = false;
                this.isSuccess = false;
                this.isCancel = true;
                this.isError = false;
                this.progress = 0;
                this.index = null;
                this.onCancel(response, status, headers);
            };
            /**
             * Inner callback
             * @param {*} response
             * @param {Number} status
             * @param {Object} headers
             * @private
             */
            FileItem.prototype._onComplete = function(response, status, headers) {
                this.onComplete(response, status, headers);
                if (this.removeAfterUpload) this.remove();
            };
            /**
             * Destroys a FileItem
             */
            FileItem.prototype._destroy = function() {
                if (this._input) this._input.remove();
                if (this._form) this._form.remove();
                delete this._form;
                delete this._input;
            };
            /**
             * Prepares to uploading
             * @private
             */
            FileItem.prototype._prepareToUploading = function() {
                this.index = this.index || ++this.uploader._nextIndex;
                this.isReady = true;
            };
            /**
             * Replaces input element on his clone
             * @param {JQLite|jQuery} input
             * @private
             */
            FileItem.prototype._replaceNode = function(input) {
                var clone = $compile(input.clone())(input.scope());
                clone.prop('value', null); // FF fix
                input.css('display', 'none');
                input.after(clone); // remove jquery dependency
            };

            // ---------------------------

            /**
             * Creates instance of {FileDirective} object
             * @param {Object} options
             * @param {Object} options.uploader
             * @param {HTMLElement} options.element
             * @param {Object} options.events
             * @param {String} options.prop
             * @constructor
             */
            function FileDirective(options) {
                angular.extend(this, options);
                this.uploader._directives[this.prop].push(this);
                this._saveLinks();
                this.bind();
            }
            /**
             * Map of events
             * @type {Object}
             */
            FileDirective.prototype.events = {};
            /**
             * Binds events handles
             */
            FileDirective.prototype.bind = function() {
                for(var key in this.events) {
                    var prop = this.events[key];
                    this.element.bind(key, this[prop]);
                }
            };
            /**
             * Unbinds events handles
             */
            FileDirective.prototype.unbind = function() {
                for(var key in this.events) {
                    this.element.unbind(key, this.events[key]);
                }
            };
            /**
             * Destroys directive
             */
            FileDirective.prototype.destroy = function() {
                var index = this.uploader._directives[this.prop].indexOf(this);
                this.uploader._directives[this.prop].splice(index, 1);
                this.unbind();
                // this.element = null;
            };
            /**
             * Saves links to functions
             * @private
             */
            FileDirective.prototype._saveLinks = function() {
                for(var key in this.events) {
                    var prop = this.events[key];
                    this[prop] = this[prop].bind(this);
                }
            };

            // ---------------------------

            FileUploader.inherit(FileSelect, FileDirective);

            /**
             * Creates instance of {FileSelect} object
             * @param {Object} options
             * @constructor
             */
            function FileSelect(options) {
                FileSelect.super_.apply(this, arguments);

                if(!this.uploader.isHTML5) {
                    this.element.removeAttr('multiple');
                }
                this.element.prop('value', null); // FF fix
            }
            /**
             * Map of events
             * @type {Object}
             */
            FileSelect.prototype.events = {
                $destroy: 'destroy',
                change: 'onChange'
            };
            /**
             * Name of property inside uploader._directive object
             * @type {String}
             */
            FileSelect.prototype.prop = 'select';
            /**
             * Returns options
             * @return {Object|undefined}
             */
            FileSelect.prototype.getOptions = function() {};
            /**
             * Returns filters
             * @return {Array<Function>|String|undefined}
             */
            FileSelect.prototype.getFilters = function() {};
            /**
             * If returns "true" then HTMLInputElement will be cleared
             * @returns {Boolean}
             */
            FileSelect.prototype.isEmptyAfterSelection = function() {
                return !!this.element.attr('multiple');
            };
            /**
             * Event handler
             */
            FileSelect.prototype.onChange = function() {
                var files = this.uploader.isHTML5 ? this.element[0].files : this.element[0];
                var options = this.getOptions();
                var filters = this.getFilters();

                if (!this.uploader.isHTML5) this.destroy();
                this.uploader.addToQueue(files, options, filters);
                if (this.isEmptyAfterSelection()) this.element.prop('value', null);
            };

            // ---------------------------

            FileUploader.inherit(FileDrop, FileDirective);

            /**
             * Creates instance of {FileDrop} object
             * @param {Object} options
             * @constructor
             */
            function FileDrop(options) {
                FileDrop.super_.apply(this, arguments);
            }
            /**
             * Map of events
             * @type {Object}
             */
            FileDrop.prototype.events = {
                $destroy: 'destroy',
                drop: 'onDrop',
                dragover: 'onDragOver',
                dragleave: 'onDragLeave'
            };
            /**
             * Name of property inside uploader._directive object
             * @type {String}
             */
            FileDrop.prototype.prop = 'drop';
            /**
             * Returns options
             * @return {Object|undefined}
             */
            FileDrop.prototype.getOptions = function() {};
            /**
             * Returns filters
             * @return {Array<Function>|String|undefined}
             */
            FileDrop.prototype.getFilters = function() {};
            /**
             * Event handler
             */
            FileDrop.prototype.onDrop = function(event) {
                var transfer = this._getTransfer(event);
                if (!transfer) return;
                var options = this.getOptions();
                var filters = this.getFilters();
                this._preventAndStop(event);
                angular.forEach(this.uploader._directives.over, this._removeOverClass, this);
                this.uploader.addToQueue(transfer.files, options, filters);
            };
            /**
             * Event handler
             */
            FileDrop.prototype.onDragOver = function(event) {
                var transfer = this._getTransfer(event);
                if(!this._haveFiles(transfer.types)) return;
                transfer.dropEffect = 'copy';
                this._preventAndStop(event);
                angular.forEach(this.uploader._directives.over, this._addOverClass, this);
            };
            /**
             * Event handler
             */
            FileDrop.prototype.onDragLeave = function(event) {
                if (event.currentTarget !== this.element[0]) return;
                this._preventAndStop(event);
                angular.forEach(this.uploader._directives.over, this._removeOverClass, this);
            };
            /**
             * Helper
             */
            FileDrop.prototype._getTransfer = function(event) {
                return event.dataTransfer ? event.dataTransfer : event.originalEvent.dataTransfer; // jQuery fix;
            };
            /**
             * Helper
             */
            FileDrop.prototype._preventAndStop = function(event) {
                event.preventDefault();
                event.stopPropagation();
            };
            /**
             * Returns "true" if types contains files
             * @param {Object} types
             */
            FileDrop.prototype._haveFiles = function(types) {
                if (!types) return false;
                if (types.indexOf) {
                    return types.indexOf('Files') !== -1;
                } else if(types.contains) {
                    return types.contains('Files');
                } else {
                    return false;
                }
            };
            /**
             * Callback
             */
            FileDrop.prototype._addOverClass = function(item) {
                item.addOverClass();
            };
            /**
             * Callback
             */
            FileDrop.prototype._removeOverClass = function(item) {
                item.removeOverClass();
            };

            // ---------------------------

            FileUploader.inherit(FileOver, FileDirective);

            /**
             * Creates instance of {FileDrop} object
             * @param {Object} options
             * @constructor
             */
            function FileOver(options) {
                FileOver.super_.apply(this, arguments);
            }
            /**
             * Map of events
             * @type {Object}
             */
            FileOver.prototype.events = {
                $destroy: 'destroy'
            };
            /**
             * Name of property inside uploader._directive object
             * @type {String}
             */
            FileOver.prototype.prop = 'over';
            /**
             * Over class
             * @type {string}
             */
            FileOver.prototype.overClass = 'nv-file-over';
            /**
             * Adds over class
             */
            FileOver.prototype.addOverClass = function() {
                this.element.addClass(this.getOverClass());
            };
            /**
             * Removes over class
             */
            FileOver.prototype.removeOverClass = function() {
                this.element.removeClass(this.getOverClass());
            };
            /**
             * Returns over class
             * @returns {String}
             */
            FileOver.prototype.getOverClass = function() {
                return this.overClass;
            };

            return FileUploader;
        }])


    .directive('nvFileSelect', ['$parse', 'FileUploader', function($parse, FileUploader) {
        return {
            link: function(scope, element, attributes) {
                var uploader = scope.$eval(attributes.uploader);

                if (!(uploader instanceof FileUploader)) {
                    throw new TypeError('"Uploader" must be an instance of FileUploader');
                }

                var object = new FileUploader.FileSelect({
                    uploader: uploader,
                    element: element
                });

                object.getOptions = $parse(attributes.options).bind(object, scope);
                object.getFilters = function() {return attributes.filters;};
            }
        };
    }])


    .directive('nvFileDrop', ['$parse', 'FileUploader', function($parse, FileUploader) {
        return {
            link: function(scope, element, attributes) {
                var uploader = scope.$eval(attributes.uploader);

                if (!(uploader instanceof FileUploader)) {
                    throw new TypeError('"Uploader" must be an instance of FileUploader');
                }

                if (!uploader.isHTML5) return;

                var object = new FileUploader.FileDrop({
                    uploader: uploader,
                    element: element
                });

                object.getOptions = $parse(attributes.options).bind(object, scope);
                object.getFilters = function() {return attributes.filters;};
            }
        };
    }])


    .directive('nvFileOver', ['FileUploader', function(FileUploader) {
        return {
            link: function(scope, element, attributes) {
                var uploader = scope.$eval(attributes.uploader);

                if (!(uploader instanceof FileUploader)) {
                    throw new TypeError('"Uploader" must be an instance of FileUploader');
                }

                var object = new FileUploader.FileOver({
                    uploader: uploader,
                    element: element
                });

                object.getOverClass = function() {
                    return attributes.overClass || this.overClass;
                };
            }
        };
    }])

    return module;
}));
(function(angular) {
    'use strict';
    angular.module('FileManagerApp').provider('fileManagerConfig', function() {

        var values = {
            appName: 'SalesDrive',
            defaultLang: 'en',

            listUrl: 'bridges/php/handler.php',
            uploadUrl: 'bridges/php/handler.php',
            renameUrl: 'bridges/php/handler.php',
            copyUrl: 'bridges/php/handler.php',
            moveUrl: 'bridges/php/handler.php',
            removeUrl: 'bridges/php/handler.php',
            editUrl: 'bridges/php/handler.php',
            getContentUrl: 'bridges/php/handler.php',
            createFolderUrl: 'bridges/php/handler.php',
            downloadFileUrl: 'bridges/php/handler.php',
            downloadMultipleUrl: 'bridges/php/handler.php',
            compressUrl: 'bridges/php/handler.php',
            extractUrl: 'bridges/php/handler.php',
            permissionsUrl: 'bridges/php/handler.php',
            basePath: '/',

            searchForm: true,
            sidebar: true,
            breadcrumb: true,
            allowedActions: {
                upload: true,
                rename: true,
                move: true,
                copy: true,
                edit: true,
                changePermissions: true,
                compress: true,
                compressChooseName: true,
                extract: true,
                download: true,
                downloadMultiple: true,
                preview: true,
                remove: true,
                createFolder: true,
                pickFiles: false,
                pickFolders: false
            },

            multipleDownloadFileName: 'angular-filemanager.zip',
            filterFileExtensions: [],
            showExtensionIcons: true,
            showSizeForDirectories: false,
            useBinarySizePrefixes: false,
            downloadFilesByAjax: true,
            previewImagesInModal: true,
            enablePermissionsRecursive: true,
            compressAsync: false,
            extractAsync: false,
            pickCallback: null,

            isEditableFilePattern: /\.(txt|diff?|patch|svg|asc|cnf|cfg|conf|html?|.html|cfm|cgi|aspx?|ini|pl|py|md|css|cs|js|jsp|log|htaccess|htpasswd|gitignore|gitattributes|env|json|atom|eml|rss|markdown|sql|xml|xslt?|sh|rb|as|bat|cmd|cob|for|ftn|frm|frx|inc|lisp|scm|coffee|php[3-6]?|java|c|cbl|go|h|scala|vb|tmpl|lock|go|yml|yaml|tsv|lst)$/i,
            isImageFilePattern: /\.(jpe?g|gif|bmp|png|svg|tiff?)$/i,
            isExtractableFilePattern: /\.(gz|tar|rar|g?zip)$/i,
            tplPath: 'src/templates'
        };

        return {
            $get: function() {
                return values;
            },
            set: function (constants) {
                angular.extend(values, constants);
            }
        };

    });
})(angular);

(function (angular) {
    'use strict';
    angular.module('FileManagerApp').config(['$translateProvider', function ($translateProvider) {
        $translateProvider.useSanitizeValueStrategy(null);

        $translateProvider.translations('en', {
            filemanager: 'File Manager',
            language: 'Language',
            english: 'English',
            spanish: 'Spanish',
            portuguese: 'Portuguese',
            french: 'French',
            german: 'German',
            hebrew: 'Hebrew',
            italian: 'Italian',
            slovak: 'Slovak',
            chinese: 'Chinese',
            russian: 'Russian',
            ukrainian: 'Ukrainian',
            turkish: 'Turkish',
            persian: 'Persian',
            polish: 'Polish',
            confirm: 'Confirm',
            cancel: 'Cancel',
            close: 'Close',
            upload_files: 'Upload files',
            files_will_uploaded_to: 'Files will be uploaded to',
            select_files: 'Select files',
            uploading: 'Uploading',
            permissions: 'Permissions',
            select_destination_folder: 'Select the destination folder',
            source: 'Source',
            destination: 'Destination',
            copy_file: 'Copy file',
            sure_to_delete: 'Are you sure to delete',
            change_name_move: 'Change name / move',
            enter_new_name_for: 'Enter new name for',
            extract_item: 'Extract item',
            extraction_started: 'Extraction started in a background process',
            compression_started: 'Compression started in a background process',
            enter_folder_name_for_extraction: 'Enter the folder name for the extraction of',
            enter_file_name_for_compression: 'Enter the file name for the compression of',
            toggle_fullscreen: 'Toggle fullscreen',
            edit_file: 'Edit file',
            file_content: 'File content',
            loading: 'Loading',
            search: 'Search',
            create_folder: 'Create folder',
            create: 'Create',
            folder_name: 'Folder name',
            upload: 'Upload',
            change_permissions: 'Change permissions',
            change: 'Change',
            details: 'Details',
            icons: 'Icons',
            list: 'List',
            name: 'Name',
            size: 'Size',
            actions: 'Actions',
            date: 'Date',
            selection: 'Selection',
            no_files_in_folder: 'No files in this folder',
            no_folders_in_folder: 'This folder not contains children folders',
            select_this: 'Select this',
            go_back: 'Go back',
            wait: 'Wait',
            move: 'Move',
            download: 'Download',
            view_item: 'View item',
            remove: 'Delete',
            edit: 'Edit',
            copy: 'Copy',
            rename: 'Rename',
            extract: 'Extract',
            compress: 'Compress',
            error_invalid_filename: 'Invalid filename or already exists, specify another name',
            error_modifying: 'An error occurred modifying the file',
            error_deleting: 'An error occurred deleting the file or folder',
            error_renaming: 'An error occurred renaming the file',
            error_copying: 'An error occurred copying the file',
            error_compressing: 'An error occurred compressing the file or folder',
            error_extracting: 'An error occurred extracting the file',
            error_creating_folder: 'An error occurred creating the folder',
            error_getting_content: 'An error occurred getting the content of the file',
            error_changing_perms: 'An error occurred changing the permissions of the file',
            error_uploading_files: 'An error occurred uploading files',
            sure_to_start_compression_with: 'Are you sure to compress',
            owner: 'Owner',
            group: 'Group',
            others: 'Others',
            read: 'Read',
            write: 'Write',
            exec: 'Exec',
            original: 'Original',
            changes: 'Changes',
            recursive: 'Recursive',
            preview: 'Item preview',
            open: 'Open',
            these_elements: 'these {{total}} elements',
            new_folder: 'New folder',
            download_as_zip: 'Download as ZIP'
        });

        $translateProvider.translations('he', {
            filemanager: 'מנהל קבצים',
            language: 'שפה',
            english: 'אנגלית',
            spanish: 'ספרדית',
            portuguese: 'פורטוגזית',
            french: 'צרפתית',
            german: 'גרמנית',
            hebrew: 'עברי',
            italian: 'איטלקי',
            slovak: 'סלובקי',
            chinese: 'סִינִית',
            russian: 'רוּסִי',
            ukrainian: 'אוקראיני',
            turkish: 'טורקי',
            persian: 'פַּרסִית',
            polish: 'פולני',
            confirm: 'אשר',
            cancel: 'בטל',
            close: 'סגור',
            upload_files: 'העלה קבצים',
            files_will_uploaded_to: 'הקבצים יעלו ל',
            select_files: 'בחר קבצים',
            uploading: 'מעלה',
            permissions: 'הרשאות',
            select_destination_folder: 'בחר תיקיית יעד',
            source: 'מקור',
            destination: 'יעד',
            copy_file: 'העתק קובץ',
            sure_to_delete: 'האם אתה בטוח שברצונך למחוק',
            change_name_move: 'שנה שם / הזז',
            enter_new_name_for: 'הקלד שם חדש עבור',
            extract_item: 'חלץ פריט',
            extraction_started: 'תהליך החילוץ מתבצע ברקע',
            compression_started: 'תהליך הכיווץ מתבצע ברקע',
            enter_folder_name_for_extraction: 'הקלד שם תיקייה לחילוץ עבור',
            enter_file_name_for_compression: 'הזן את שם הקובץ עבור הדחיסה של',
            toggle_fullscreen: 'הפעל/בטל מסך מלא',
            edit_file: 'ערוך קובץ',
            file_content: 'תוכן הקובץ',
            loading: 'טוען',
            search: 'חפש',
            create_folder: 'צור תיקייה',
            create: 'צור',
            folder_name: 'שם תיקייה',
            upload: 'העלה',
            change_permissions: 'שנה הרשאות',
            change: 'שנה',
            details: 'פרטים',
            icons: 'סמלים',
            list: 'רשימה',
            name: 'שם',
            size: 'גודל',
            actions: 'פעולות',
            date: 'תאריך',
            selection: 'בְּחִירָה',
            no_files_in_folder: 'אין קבצים בתיקייה זו',
            no_folders_in_folder: 'התיקייה הזו אינה כוללת תתי תיקיות',
            select_this: 'בחר את זה',
            go_back: 'חזור אחורה',
            wait: 'חכה',
            move: 'הזז',
            download: 'הורד',
            view_item: 'הצג פריט',
            remove: 'מחק',
            edit: 'ערוך',
            copy: 'העתק',
            rename: 'שנה שם',
            extract: 'חלץ',
            compress: 'כווץ',
            error_invalid_filename: 'שם קובץ אינו תקין או קיים, ציין שם קובץ אחר',
            error_modifying: 'התרחשה שגיאה בעת שינוי הקובץ',
            error_deleting: 'התרחשה שגיאה בעת מחיקת הקובץ או התיקייה',
            error_renaming: 'התרחשה שגיאה בעת שינוי שם הקובץ',
            error_copying: 'התרחשה שגיאה בעת העתקת הקובץ',
            error_compressing: 'התרחשה שגיאה בעת כיווץ הקובץ או התיקייה',
            error_extracting: 'התרחשה שגיאה בעת חילוץ הקובץ או התיקייה',
            error_creating_folder: 'התרחשה שגיאה בעת יצירת התיקייה',
            error_getting_content: 'התרחשה שגיאה בעת בקשת תוכן הקובץ',
            error_changing_perms: 'התרחשה שגיאה בעת שינוי הרשאות הקובץ',
            error_uploading_files: 'התרחשה שגיאה בעת העלאת הקבצים',
            sure_to_start_compression_with: 'האם אתה בטוח שברצונך לכווץ',
            owner: 'בעלים',
            group: 'קבוצה',
            others: 'אחרים',
            read: 'קריאה',
            write: 'כתיבה',
            exec: 'הרצה',
            original: 'מקורי',
            changes: 'שינויים',
            recursive: 'רקורסיה',
            preview: 'הצגת פריט',
            open: 'פתח',
            new_folder: 'תיקיה חדשה',
            download_as_zip: 'להוריד כמו'
        });

        $translateProvider.translations('pt', {
            filemanager: 'Gerenciador de arquivos',
            language: 'Língua',
            english: 'Inglês',
            spanish: 'Espanhol',
            portuguese: 'Portugues',
            french: 'Francês',
            german: 'Alemão',
            hebrew: 'Hebraico',
            italian: 'Italiano',
            slovak: 'Eslovaco',
            chinese: 'Chinês',
            russian: 'Russo',
            ukrainian: 'Ucraniano',
            turkish: 'Turco',
            persian: 'Persa',
            polish: 'Polonês',
            confirm: 'Confirmar',
            cancel: 'Cancelar',
            close: 'Fechar',
            upload_files: 'Carregar arquivos',
            files_will_uploaded_to: 'Os arquivos serão enviados para',
            select_files: 'Selecione os arquivos',
            uploading: 'Carregar',
            permissions: 'Autorizações',
            select_destination_folder: 'Selecione a pasta de destino',
            source: 'Origem',
            destination: 'Destino',
            copy_file: 'Copiar arquivo',
            sure_to_delete: 'Tem certeza de que deseja apagar',
            change_name_move: 'Renomear / mudança',
            enter_new_name_for: 'Digite o novo nome para',
            extract_item: 'Extrair arquivo',
            extraction_started: 'A extração começou em um processo em segundo plano',
            compression_started: 'A compressão começou em um processo em segundo plano',
            enter_folder_name_for_extraction: 'Digite o nome da pasta para a extração de',
            enter_file_name_for_compression: 'Digite o nome do arquivo para a compressão de',
            toggle_fullscreen: 'Ativar/desativar tela cheia',
            edit_file: 'Editar arquivo',
            file_content: 'Conteúdo do arquivo',
            loading: 'Carregando',
            search: 'Localizar',
            create_folder: 'Criar Pasta',
            create: 'Criar',
            folder_name: 'Nome da pasta',
            upload: 'Fazer',
            change_permissions: 'Alterar permissões',
            change: 'Alterar',
            details: 'Detalhes',
            icons: 'Icones',
            list: 'Lista',
            name: 'Nome',
            size: 'Tamanho',
            actions: 'Ações',
            date: 'Data',
            selection: 'Seleção',
            no_files_in_folder: 'Não há arquivos nesta pasta',
            no_folders_in_folder: 'Esta pasta não contém subpastas',
            select_this: 'Selecione esta',
            go_back: 'Voltar',
            wait: 'Espere',
            move: 'Mover',
            download: 'Baixar',
            view_item: 'Veja o arquivo',
            remove: 'Excluir',
            edit: 'Editar',
            copy: 'Copiar',
            rename: 'Renomear',
            extract: 'Extrair',
            compress: 'Comprimir',
            error_invalid_filename: 'Nome do arquivo inválido ou nome de arquivo já existe, especifique outro nome',
            error_modifying: 'Ocorreu um erro ao modificar o arquivo',
            error_deleting: 'Ocorreu um erro ao excluir o arquivo ou pasta',
            error_renaming: 'Ocorreu um erro ao mudar o nome do arquivo',
            error_copying: 'Ocorreu um erro ao copiar o arquivo',
            error_compressing: 'Ocorreu um erro ao comprimir o arquivo ou pasta',
            error_extracting: 'Ocorreu um erro ao extrair o arquivo',
            error_creating_folder: 'Ocorreu um erro ao criar a pasta',
            error_getting_content: 'Ocorreu um erro ao obter o conteúdo do arquivo',
            error_changing_perms: 'Ocorreu um erro ao alterar as permissões do arquivo',
            error_uploading_files: 'Ocorreu um erro upload de arquivos',
            sure_to_start_compression_with: 'Tem certeza que deseja comprimir',
            owner: 'Proprietário',
            group: 'Grupo',
            others: 'Outros',
            read: 'Leitura',
            write: 'Escrita ',
            exec: 'Execução',
            original: 'Original',
            changes: 'Mudanças',
            recursive: 'Recursiva',
            preview: 'Visualização',
            open: 'Abrir',
            these_elements: 'estes {{total}} elements',
            new_folder: 'Nova pasta',
            download_as_zip: 'Download como ZIP'
        });

        $translateProvider.translations('es', {
            filemanager: 'Administrador de archivos',
            language: 'Idioma',
            english: 'Ingles',
            spanish: 'Español',
            portuguese: 'Portugues',
            french: 'Francés',
            german: 'Alemán',
            hebrew: 'Hebreo',
            italian: 'Italiano',
            slovak: 'Eslovaco',
            chinese: 'Chino',
            russian: 'Ruso',
            ukrainian: 'Ucraniano',
            turkish: 'Turco',
            persian: 'Persa',
            polish: 'Polaco',
            confirm: 'Confirmar',
            cancel: 'Cancelar',
            close: 'Cerrar',
            upload_files: 'Subir archivos',
            files_will_uploaded_to: 'Los archivos seran subidos a',
            select_files: 'Seleccione los archivos',
            uploading: 'Subiendo',
            permissions: 'Permisos',
            select_destination_folder: 'Seleccione la carpeta de destino',
            source: 'Origen',
            destination: 'Destino',
            copy_file: 'Copiar archivo',
            sure_to_delete: 'Esta seguro que desea eliminar',
            change_name_move: 'Renombrar / mover',
            enter_new_name_for: 'Ingrese el nuevo nombre para',
            extract_item: 'Extraer archivo',
            extraction_started: 'La extraccion ha comenzado en un proceso de segundo plano',
            compression_started: 'La compresion ha comenzado en un proceso de segundo plano',
            enter_folder_name_for_extraction: 'Ingrese el nombre de la carpeta para la extraccion de',
            enter_file_name_for_compression: 'Ingrese el nombre del archivo para la compresion de',
            toggle_fullscreen: 'Activar/Desactivar pantalla completa',
            edit_file: 'Editar archivo',
            file_content: 'Contenido del archivo',
            loading: 'Cargando',
            search: 'Buscar',
            create_folder: 'Crear carpeta',
            create: 'Crear',
            folder_name: 'Nombre de la carpeta',
            upload: 'Subir',
            change_permissions: 'Cambiar permisos',
            change: 'Cambiar',
            details: 'Detalles',
            icons: 'Iconos',
            list: 'Lista',
            name: 'Nombre',
            size: 'Tamaño',
            actions: 'Acciones',
            date: 'Fecha',
            selection: 'Selección',
            no_files_in_folder: 'No hay archivos en esta carpeta',
            no_folders_in_folder: 'Esta carpeta no contiene sub-carpetas',
            select_this: 'Seleccionar esta',
            go_back: 'Volver',
            wait: 'Espere',
            move: 'Mover',
            download: 'Descargar',
            view_item: 'Ver archivo',
            remove: 'Eliminar',
            edit: 'Editar',
            copy: 'Copiar',
            rename: 'Renombrar',
            extract: 'Extraer',
            compress: 'Comprimir',
            error_invalid_filename: 'El nombre del archivo es invalido o ya existe',
            error_modifying: 'Ocurrio un error al intentar modificar el archivo',
            error_deleting: 'Ocurrio un error al intentar eliminar el archivo',
            error_renaming: 'Ocurrio un error al intentar renombrar el archivo',
            error_copying: 'Ocurrio un error al intentar copiar el archivo',
            error_compressing: 'Ocurrio un error al intentar comprimir el archivo',
            error_extracting: 'Ocurrio un error al intentar extraer el archivo',
            error_creating_folder: 'Ocurrio un error al intentar crear la carpeta',
            error_getting_content: 'Ocurrio un error al obtener el contenido del archivo',
            error_changing_perms: 'Ocurrio un error al cambiar los permisos del archivo',
            error_uploading_files: 'Ocurrio un error al subir archivos',
            sure_to_start_compression_with: 'Esta seguro que desea comprimir',
            owner: 'Propietario',
            group: 'Grupo',
            others: 'Otros',
            read: 'Lectura',
            write: 'Escritura',
            exec: 'Ejecucion',
            original: 'Original',
            changes: 'Cambios',
            recursive: 'Recursivo',
            preview: 'Vista previa',
            open: 'Abrir',
            these_elements: 'estos {{total}} elementos',
            new_folder: 'Nueva carpeta',
            download_as_zip: 'Descargar como ZIP'
        });

        $translateProvider.translations('fr', {
            filemanager: 'Gestionnaire de fichier',
            language: 'Langue',
            english: 'Anglais',
            spanish: 'Espagnol',
            portuguese: 'Portugais',
            french: 'Français',
            german: 'Allemand',
            hebrew: 'Hébreu',
            italian: 'Italien',
            slovak: 'Slovaque',
            chinese: 'Chinois',
            russian: 'Russe',
            ukrainian: 'Ukrainien',
            turkish: 'Turc',
            persian: 'Persan',
            polish: 'Polonais',
            confirm: 'Confirmer',
            cancel: 'Annuler',
            close: 'Fermer',
            upload_files: 'Télécharger des fichiers',
            files_will_uploaded_to: 'Les fichiers seront uploadé dans',
            select_files: 'Sélectionnez les fichiers',
            uploading: 'Upload en cours',
            permissions: 'Permissions',
            select_destination_folder: 'Sélectionné le dossier de destination',
            source: 'Source',
            destination: 'Destination',
            copy_file: 'Copier le fichier',
            sure_to_delete: 'Êtes-vous sûr de vouloir supprimer',
            change_name_move: 'Renommer / Déplacer',
            enter_new_name_for: 'Entrer le nouveau nom pour',
            extract_item: 'Extraires les éléments',
            extraction_started: 'L\'extraction a démarré en tâche de fond',
            compression_started: 'La compression a démarré en tâche de fond',
            enter_folder_name_for_extraction: 'Entrer le nom du dossier pour l\'extraction de',
            enter_file_name_for_compression: 'Entrez le nom de fichier pour la compression de',
            toggle_fullscreen: 'Basculer en plein écran',
            edit_file: 'Éditer le fichier',
            file_content: 'Contenu du fichier',
            loading: 'Chargement en cours',
            search: 'Recherche',
            create_folder: 'Créer un dossier',
            create: 'Créer',
            folder_name: 'Nom du dossier',
            upload: 'Upload',
            change_permissions: 'Changer les permissions',
            change: 'Changer',
            details: 'Details',
            icons: 'Icons',
            list: 'Liste',
            name: 'Nom',
            size: 'Taille',
            actions: 'Actions',
            date: 'Date',
            selection: 'Sélection',
            no_files_in_folder: 'Aucun fichier dans ce dossier',
            no_folders_in_folder: 'Ce dossier ne contiens pas de dossier',
            select_this: 'Sélectionner',
            go_back: 'Retour',
            wait: 'Patienter',
            move: 'Déplacer',
            download: 'Télécharger',
            view_item: 'Voir l\'élément',
            remove: 'Supprimer',
            edit: 'Éditer',
            copy: 'Copier',
            rename: 'Renommer',
            extract: 'Extraire',
            compress: 'Compresser',
            error_invalid_filename: 'Nom de fichier invalide ou déjà existant, merci de spécifier un autre nom',
            error_modifying: 'Une erreur est survenue pendant la modification du fichier',
            error_deleting: 'Une erreur est survenue pendant la suppression du fichier ou du dossier',
            error_renaming: 'Une erreur est survenue pendant le renommage du fichier',
            error_copying: 'Une erreur est survenue pendant la copie du fichier',
            error_compressing: 'Une erreur est survenue pendant la compression du fichier ou du dossier',
            error_extracting: 'Une erreur est survenue pendant l\'extraction du fichier',
            error_creating_folder: 'Une erreur est survenue pendant la création du dossier',
            error_getting_content: 'Une erreur est survenue pendant la récupération du contenu du fichier',
            error_changing_perms: 'Une erreur est survenue pendant le changement des permissions du fichier',
            error_uploading_files: 'Une erreur est survenue pendant l\'upload des fichiers',
            sure_to_start_compression_with: 'Êtes-vous sûre de vouloir compresser',
            owner: 'Propriétaire',
            group: 'Groupe',
            others: 'Autres',
            read: 'Lecture',
            write: 'Écriture',
            exec: 'Éxécution',
            original: 'Original',
            changes: 'Modifications',
            recursive: 'Récursif',
            preview: 'Aperçu',
            open: 'Ouvrir',
            these_elements: 'ces {{total}} éléments',
            new_folder: 'Nouveau dossier',
            download_as_zip: 'Télécharger comme ZIP'
        });

        $translateProvider.translations('de', {
            filemanager: 'Dateimanager',
            language: 'Sprache',
            english: 'Englisch',
            spanish: 'Spanisch',
            portuguese: 'Portugiesisch',
            french: 'Französisch',
            german: 'Deutsch',
            hebrew: 'Hebräisch',
            italian: 'Italienisch',
            slovak: 'Slowakisch',
            chinese: 'Chinesisch',
            russian: 'Russisch',
            ukrainian: 'Ukrainisch',
            turkish: 'Türkisch',
            persian: 'Persisch',
            polish: 'Polnisch',
            confirm: 'Bestätigen',
            cancel: 'Abbrechen',
            close: 'Schließen',
            upload_files: 'Hochladen von Dateien',
            files_will_uploaded_to: 'Dateien werden hochgeladen nach',
            select_files: 'Wählen Sie die Dateien',
            uploading: 'Lade hoch',
            permissions: 'Berechtigungen',
            select_destination_folder: 'Wählen Sie einen Zielordner',
            source: 'Quelle',
            destination: 'Ziel',
            copy_file: 'Datei kopieren',
            sure_to_delete: 'Sind Sie sicher, dass Sie die Datei löschen möchten?',
            change_name_move: 'Namen ändern / verschieben',
            enter_new_name_for: 'Geben Sie den neuen Namen ein für',
            extract_item: 'Archiv entpacken',
            extraction_started: 'Entpacken hat im Hintergrund begonnen',
            compression_started: 'Komprimierung hat im Hintergrund begonnen',
            enter_folder_name_for_extraction: 'Geben Sie den Verzeichnisnamen für die Entpackung an von',
            enter_file_name_for_compression: 'Geben Sie den Dateinamen für die Kompression an von',
            toggle_fullscreen: 'Vollbild umschalten',
            edit_file: 'Datei bearbeiten',
            file_content: 'Dateiinhalt',
            loading: 'Lade',
            search: 'Suche',
            create_folder: 'Ordner erstellen',
            create: 'Erstellen',
            folder_name: 'Verzeichnisname',
            upload: 'Hochladen',
            change_permissions: 'Berechtigungen ändern',
            change: 'Ändern',
            details: 'Details',
            icons: 'Symbolansicht',
            list: 'Listenansicht',
            name: 'Name',
            size: 'Größe',
            actions: 'Aktionen',
            date: 'Datum',
            selection: 'Auswahl',
            no_files_in_folder: 'Keine Dateien in diesem Ordner',
            no_folders_in_folder: 'Dieser Ordner enthält keine Unterordner',
            select_this: 'Auswählen',
            go_back: 'Zurück',
            wait: 'Warte',
            move: 'Verschieben',
            download: 'Herunterladen',
            view_item: 'Datei ansehen',
            remove: 'Löschen',
            edit: 'Bearbeiten',
            copy: 'Kopieren',
            rename: 'Umbenennen',
            extract: 'Entpacken',
            compress: 'Komprimieren',
            error_invalid_filename: 'Ungültiger Dateiname oder existiert bereits',
            error_modifying: 'Beim Bearbeiten der Datei ist ein Fehler aufgetreten',
            error_deleting: 'Beim Löschen der Datei oder des Ordners ist ein Fehler aufgetreten',
            error_renaming: 'Beim Umbennenen der Datei ist ein Fehler aufgetreten',
            error_copying: 'Beim Kopieren der Datei ist ein Fehler aufgetreten',
            error_compressing: 'Beim Komprimieren der Datei oder des Ordners ist ein Fehler aufgetreten',
            error_extracting: 'Beim Entpacken der Datei ist ein Fehler aufgetreten',
            error_creating_folder: 'Beim Erstellen des Ordners ist ein Fehler aufgetreten',
            error_getting_content: 'Beim Laden des Dateiinhalts ist ein Fehler aufgetreten',
            error_changing_perms: 'Beim Ändern der Dateiberechtigungen ist ein Fehler aufgetreten',
            error_uploading_files: 'Beim Hochladen der Dateien ist ein Fehler aufgetreten',
            sure_to_start_compression_with: 'Möchten Sie die Datei wirklich komprimieren?',
            owner: 'Besitzer',
            group: 'Gruppe',
            others: 'Andere',
            read: 'Lesen',
            write: 'Schreiben',
            exec: 'Ausführen',
            original: 'Original',
            changes: 'Änderungen',
            recursive: 'Rekursiv',
            preview: 'Dateivorschau',
            open: 'Öffnen',
            these_elements: 'diese {{total}} elemente',
            new_folder: 'Neuer ordner',
            download_as_zip: 'Download als ZIP'
        });

        $translateProvider.translations('sk', {
            filemanager: 'Správca súborov',
            language: 'Jazyk',
            english: 'Angličtina',
            spanish: 'Španielčina',
            portuguese: 'Portugalčina',
            french: 'Francúzština',
            german: 'Nemčina',
            hebrew: 'Hebrejčina',
            italian: 'Italština',
            slovak: 'Slovenčina',
            chinese: 'Čínština',
            russian: 'Ruský',
            ukrainian: 'Ukrajinský',
            turkish: 'Turecký',
            persian: 'Perzský',
            polish: 'Poľský',
            confirm: 'Potvrdiť',
            cancel: 'Zrušiť',
            close: 'Zavrieť',
            upload_files: 'Nahrávať súbory',
            files_will_uploaded_to: 'Súbory budú nahrané do',
            select_files: 'Vybrať súbory',
            uploading: 'Nahrávanie',
            permissions: 'Oprávnenia',
            select_destination_folder: 'Vyberte cieľový príečinok',
            source: 'Zdroj',
            destination: 'Cieľ',
            copy_file: 'Kopírovať súbor',
            sure_to_delete: 'Ste si istý, že chcete vymazať',
            change_name_move: 'Premenovať / Premiestniť',
            enter_new_name_for: 'Zadajte nové meno pre',
            extract_item: 'Rozbaliť položku',
            extraction_started: 'Rozbaľovanie začalo v procese na pozadí',
            compression_started: 'Kompresia začala v procese na pzoadí',
            enter_folder_name_for_extraction: 'Zadajte názov priečinka na rozbalenie',
            enter_file_name_for_compression: 'Zadajte názov súboru pre kompresiu',
            toggle_fullscreen: 'Prepnúť režim na celú obrazovku',
            edit_file: 'Upraviť súbor',
            file_content: 'Obsah súboru',
            loading: 'Načítavanie',
            search: 'Hľadať',
            create_folder: 'Vytvoriť priečinok',
            create: 'Vytvoriť',
            folder_name: 'Názov priećinka',
            upload: 'Nahrať',
            change_permissions: 'Zmeniť oprávnenia',
            change: 'Zmeniť',
            details: 'Podrobnosti',
            icons: 'Ikony',
            list: 'Zoznam',
            name: 'Meno',
            size: 'Veľkosť',
            actions: 'Akcie',
            date: 'Dátum',
            selection: 'Výber',
            no_files_in_folder: 'V tom to priečinku nie sú žiadne súbory',
            no_folders_in_folder: 'Tento priečinok neobsahuje žiadne ďalšie priećinky',
            select_this: 'Vybrať tento',
            go_back: 'Ísť späť',
            wait: 'Počkajte',
            move: 'Presunúť',
            download: 'Stiahnuť',
            view_item: 'Zobraziť položku',
            remove: 'Vymazať',
            edit: 'Upraviť',
            copy: 'Kopírovať',
            rename: 'Premenovať',
            extract: 'Rozbaliť',
            compress: 'Komprimovať',
            error_invalid_filename: 'Neplatné alebo duplicitné meno súboru, vyberte iné meno',
            error_modifying: 'Vyskytla sa chyba pri upravovaní súboru',
            error_deleting: 'Vyskytla sa chyba pri mazaní súboru alebo priečinku',
            error_renaming: 'Vyskytla sa chyba pri premenovaní súboru',
            error_copying: 'Vyskytla sa chyba pri kopírovaní súboru',
            error_compressing: 'Vyskytla sa chyba pri komprimovaní súboru alebo priečinka',
            error_extracting: 'Vyskytla sa chyba pri rozbaľovaní súboru',
            error_creating_folder: 'Vyskytla sa chyba pri vytváraní priečinku',
            error_getting_content: 'Vyskytla sa chyba pri získavaní obsahu súboru',
            error_changing_perms: 'Vyskytla sa chyba pri zmene oprávnení súboru',
            error_uploading_files: 'Vyskytla sa chyba pri nahrávaní súborov',
            sure_to_start_compression_with: 'Ste si istý, že chcete komprimovať',
            owner: 'Vlastník',
            group: 'Skupina',
            others: 'Ostatní',
            read: 'Čítanie',
            write: 'Zapisovanie',
            exec: 'Spúštanie',
            original: 'Originál',
            changes: 'Zmeny',
            recursive: 'Rekurzívne',
            preview: 'Náhľad položky',
            open: 'Otvoriť',
            these_elements: 'týchto {{total}} prvkov',
            new_folder: 'Nový priečinok',
            download_as_zip: 'Stiahnuť ako ZIP'
        });

        $translateProvider.translations('zh', {
            filemanager: '文档管理器',
            language: '语言',
            english: '英语',
            spanish: '西班牙语',
            portuguese: '葡萄牙语',
            french: '法语',
            german: '德语',
            hebrew: '希伯来语',
            italian: '意大利',
            slovak: '斯洛伐克语',
            chinese: '中文',
            russian: '俄語',
            ukrainian: '烏克蘭',
            turkish: '土耳其',
            persian: '波斯語',
            polish: '波兰语',
            confirm: '确定',
            cancel: '取消',
            close: '关闭',
            upload_files: '上传文件',
            files_will_uploaded_to: '文件将上传到',
            select_files: '选择文件',
            uploading: '上传中',
            permissions: '权限',
            select_destination_folder: '选择目标文件',
            source: '源自',
            destination: '目的地',
            copy_file: '复制文件',
            sure_to_delete: '确定要删除？',
            change_name_move: '改名或移动？',
            enter_new_name_for: '输入新的名称',
            extract_item: '解压',
            extraction_started: '解压已经在后台开始',
            compression_started: '压缩已经在后台开始',
            enter_folder_name_for_extraction: '输入解压的目标文件夹',
            enter_file_name_for_compression: '输入要压缩的文件名',
            toggle_fullscreen: '切换全屏',
            edit_file: '编辑文件',
            file_content: '文件内容',
            loading: '加载中',
            search: '搜索',
            create_folder: '创建文件夹',
            create: '创建',
            folder_name: '文件夹名称',
            upload: '上传',
            change_permissions: '修改权限',
            change: '修改',
            details: '详细信息',
            icons: '图标',
            list: '列表',
            name: '名称',
            size: '尺寸',
            actions: '操作',
            date: '日期',
            selection: '选择',
            no_files_in_folder: '此文件夹没有文件',
            no_folders_in_folder: '此文件夹不包含子文件夹',
            select_this: '选择此文件',
            go_back: '后退',
            wait: '等待',
            move: '移动',
            download: '下载',
            view_item: '查看子项',
            remove: '删除',
            edit: '编辑',
            copy: '复制',
            rename: '重命名',
            extract: '解压',
            compress: '压缩',
            error_invalid_filename: '非法文件名或文件已经存在, 请指定其它名称',
            error_modifying: '修改文件出错',
            error_deleting: '删除文件或文件夹出错',
            error_renaming: '重命名文件出错',
            error_copying: '复制文件出错',
            error_compressing: '压缩文件或文件夹出错',
            error_extracting: '解压文件出错',
            error_creating_folder: '创建文件夹出错',
            error_getting_content: '获取文件内容出错',
            error_changing_perms: '修改文件权限出错',
            error_uploading_files: '上传文件出错',
            sure_to_start_compression_with: '确定要压缩？',
            owner: '拥有者',
            group: '群组',
            others: '其他',
            read: '读取',
            write: '写入',
            exec: '执行',
            original: '原始',
            changes: '变化',
            recursive: '递归',
            preview: '成员预览',
            open: '打开',
            these_elements: '共 {{total}} 个',
            new_folder: '新文件夹',
            download_as_zip: '下载的ZIP'
        });

        $translateProvider.translations('ru', {
            filemanager: 'Файловый менеджер',
            language: 'Язык',
            english: 'Английский',
            spanish: 'Испанский',
            portuguese: 'Португальский',
            french: 'Французкий',
            german: 'Немецкий',
            hebrew: 'Хинди',
            italian: 'итальянский',
            slovak: 'Словацкий',
            chinese: 'Китайский',
            russian: 'русский',
            ukrainian: 'украинец',
            turkish: 'турецкий',
            persian: 'персидский',
            polish: 'Польский',
            confirm: 'Подьвердить',
            cancel: 'Отменить',
            close: 'Закрыть',
            upload_files: 'Загрузка файлов',
            files_will_uploaded_to: 'Файлы будут загружены в: ',
            select_files: 'Выберите файлы',
            uploading: 'Загрузка',
            permissions: 'Разрешения',
            select_destination_folder: 'Выберите папку назначения',
            source: 'Источкик',
            destination: 'Цель',
            copy_file: 'Скопировать файл',
            sure_to_delete: 'Действительно удалить?',
            change_name_move: 'Переименовать / переместить',
            enter_new_name_for: 'Новое имя для',
            extract_item: 'Извлечь',
            extraction_started: 'Извлечение начато',
            compression_started: 'Сжатие начато',
            enter_folder_name_for_extraction: 'Извлечь в укананную папку',
            enter_file_name_for_compression: 'Введите имя архива',
            toggle_fullscreen: 'На весь экран',
            edit_file: 'Редактировать',
            file_content: 'Содержимое файла',
            loading: 'Загрузка',
            search: 'Поиск',
            create_folder: 'Создать папку',
            create: 'Создать',
            folder_name: 'Имя папки',
            upload: 'Загрузить',
            change_permissions: 'Изменить разрешения',
            change: 'Изменить',
            details: 'Свойства',
            icons: 'Иконки',
            list: 'Список',
            name: 'Имя',
            size: 'Размер',
            actions: 'Действия',
            date: 'Дата',
            selection: 'выбор',
            no_files_in_folder: 'Пустая папка',
            no_folders_in_folder: 'Пустая папка',
            select_this: 'Выбрать',
            go_back: 'Назад',
            wait: 'Подождите',
            move: 'Переместить',
            download: 'Скачать',
            view_item: 'Отобразить содержимое',
            remove: 'Удалить',
            edit: 'Редактировать',
            copy: 'Скопировать',
            rename: 'Переименовать',
            extract: 'Извлечь',
            compress: 'Сжать',
            error_invalid_filename: 'Имя неверное или уже существует, выберите другое',
            error_modifying: 'Произошла ошибка при модифицировании файла',
            error_deleting: 'Произошла ошибка при удалении',
            error_renaming: 'Произошла ошибка при переименовании файла',
            error_copying: 'Произошла ошибка при копировании файла',
            error_compressing: 'Произошла ошибка при сжатии',
            error_extracting: 'Произошла ошибка при извлечении',
            error_creating_folder: 'Произошла ошибка при создании папки',
            error_getting_content: 'Произошла ошибка при получении содержимого',
            error_changing_perms: 'Произошла ошибка при изменении разрешений',
            error_uploading_files: 'Произошла ошибка при загрузке',
            sure_to_start_compression_with: 'Действительно сжать',
            owner: 'Владелец',
            group: 'Группа',
            others: 'Другие',
            read: 'Чтение',
            write: 'Запись',
            exec: 'Выполнение',
            original: 'По-умолчанию',
            changes: 'Изменения',
            recursive: 'Рекурсивно',
            preview: 'Просмотр',
            open: 'Открыть',
            these_elements: 'всего {{total}} елементов',
            new_folder: 'Новая папка',
            download_as_zip: 'Download as ZIP'
        });

        $translateProvider.translations('ua', {
            filemanager: 'Файловий менеджер',
            language: 'Мова',
            english: 'Англійська',
            spanish: 'Іспанська',
            portuguese: 'Португальська',
            french: 'Французька',
            german: 'Німецька',
            hebrew: 'Хінді',
            italian: 'італійський',
            slovak: 'Словацька',
            chinese: 'Китайська',
            russian: 'російський',
            ukrainian: 'український',
            turkish: 'турецька',
            persian: 'перський',
            polish: 'Польська',
            confirm: 'Підтвердити',
            cancel: 'Відмінити',
            close: 'Закрити',
            upload_files: 'Завантаження файлів',
            files_will_uploaded_to: 'Файли будуть завантажені у: ',
            select_files: 'Виберіть файли',
            uploading: 'Завантаження',
            permissions: 'Дозволи',
            select_destination_folder: 'Виберіть папку призначення',
            source: 'Джерело',
            destination: 'Ціль',
            copy_file: 'Скопіювати файл',
            sure_to_delete: 'Дійсно удалить?',
            change_name_move: 'Перейменувати / перемістити',
            enter_new_name_for: 'Нове ім\'я для',
            extract_item: 'Извлечь',
            extraction_started: 'Извлечение начато',
            compression_started: 'Архівацію почато',
            enter_folder_name_for_extraction: 'Извлечь в укананную папку',
            enter_file_name_for_compression: 'Введите имя архива',
            toggle_fullscreen: 'На весь экран',
            edit_file: 'Редагувати',
            file_content: 'Вміст файлу',
            loading: 'Завантаження',
            search: 'Пошук',
            create_folder: 'Створити папку',
            create: 'Створити',
            folder_name: 'Ім\'я  папки',
            upload: 'Завантижити',
            change_permissions: 'Змінити дозволи',
            change: 'Редагувати',
            details: 'Властивості',
            icons: 'Іконки',
            list: 'Список',
            name: 'Ім\'я',
            size: 'Розмір',
            actions: 'Дії',
            date: 'Дата',
            selection: 'вибір',
            no_files_in_folder: 'Пуста папка',
            no_folders_in_folder: 'Пуста папка',
            select_this: 'Выбрати',
            go_back: 'Назад',
            wait: 'Зачекайте',
            move: 'Перемістити',
            download: 'Скачати',
            view_item: 'Показати вміст',
            remove: 'Видалити',
            edit: 'Редагувати',
            copy: 'Копіювати',
            rename: 'Переіменувати',
            extract: 'Розархівувати',
            compress: 'Архівувати',
            error_invalid_filename: 'Ім\'я певірне або вже існує, виберіть інше',
            error_modifying: 'Виникла помилка при редагуванні файлу',
            error_deleting: 'Виникла помилка при видаленні',
            error_renaming: 'Виникла помилка при зміні імені файлу',
            error_copying: 'Виникла помилка при коміюванні файлу',
            error_compressing: 'Виникла помилка при стисненні',
            error_extracting: 'Виникла помилка при розархівації',
            error_creating_folder: 'Виникла помилка при створенні папки',
            error_getting_content: 'Виникла помилка при отриманні вмісту',
            error_changing_perms: 'Виникла помилка при зміні дозволів',
            error_uploading_files: 'Виникла помилка при завантаженні',
            sure_to_start_compression_with: 'Дійсно стиснути',
            owner: 'Власник',
            group: 'Група',
            others: 'Інші',
            read: 'Читання',
            write: 'Запис',
            exec: 'Виконання',
            original: 'За замовчуванням',
            changes: 'Зміни',
            recursive: 'Рекурсивно',
            preview: 'Перегляд',
            open: 'Відкрити',
            these_elements: 'усього {{total}} елементів',
            new_folder: 'Нова папка',
            download_as_zip: 'Download as ZIP'
        });

        $translateProvider.translations('tr', {
            filemanager: 'Dosya Yöneticisi',
            language: 'Dil',
            english: 'İngilizce',
            spanish: 'İspanyolca',
            portuguese: 'Portekizce',
            french: 'Fransızca',
            german: 'Almanca',
            hebrew: 'İbranice',
            italian: 'İtalyanca',
            slovak: 'Slovakça',
            chinese: 'Çince',
            russian: 'Rusça',
            ukrainian: 'Ukraynaca',
            turkish: 'Türkçe',
            persian: 'Farsça',
            polish: 'Lehçe',
            confirm: 'Onayla',
            cancel: 'İptal Et',
            close: 'Kapat',
            upload_files: 'Dosya yükle',
            files_will_uploaded_to: 'Dosyalar yüklenecektir.',
            select_files: 'Dosya Seç',
            uploading: 'Yükleniyor',
            permissions: 'İzinler',
            select_destination_folder: 'Hedef klasör seçin',
            source: 'Kaynak',
            destination: 'Hedef',
            copy_file: 'Dosyayı kopyala',
            sure_to_delete: 'Silmek istediğinden emin misin',
            change_name_move: 'İsmini değiştir / taşı',
            enter_new_name_for: 'Yeni ad girin',
            extract_item: 'Dosya çıkar',
            extraction_started: 'Çıkarma işlemi arkaplanda devam ediyor',
            compression_started: 'Sıkıştırma işlemi arkaplanda başladı',
            enter_folder_name_for_extraction: 'Çıkarılması için klasör adı girin',
            enter_file_name_for_compression: 'Sıkıştırılması için dosya adı girin',
            toggle_fullscreen: 'Tam ekran moduna geç',
            edit_file: 'Dosyayı düzenle',
            file_content: 'Dosya içeriği',
            loading: 'Yükleniyor',
            search: 'Ara',
            create_folder: 'Klasör oluştur',
            create: 'Oluştur',
            folder_name: 'Klasör adı',
            upload: 'Yükle',
            change_permissions: 'İzinleri değiştir',
            change: 'Değiştir',
            details: 'Detaylar',
            icons: 'simgeler',
            list: 'Liste',
            name: 'Adı',
            size: 'Boyutu',
            actions: 'İşlemler',
            date: 'Tarih',
            selection: 'Seçim',
            no_files_in_folder: 'Klasörde hiç dosya yok',
            no_folders_in_folder: 'Bu klasör alt klasör içermez',
            select_this: 'Bunu seç',
            go_back: 'Geri git',
            wait: 'Bekle',
            move: 'Taşı',
            download: 'İndir',
            view_item: 'Dosyayı görüntüle',
            remove: 'Sil',
            edit: 'Düzenle',
            copy: 'Kopyala',
            rename: 'Yeniden Adlandır',
            extract: 'Çıkart',
            compress: 'Sıkıştır',
            error_invalid_filename: 'Geçersiz dosya adı, bu dosya adına sahip dosya mevcut',
            error_modifying: 'Dosya düzenlenirken bir hata oluştu',
            error_deleting: 'Klasör veya dosya silinirken bir hata oluştu',
            error_renaming: 'Dosya yeniden adlandırılırken bir hata oluştu',
            error_copying: 'Dosya kopyalanırken bir hata oluştu',
            error_compressing: 'Dosya veya klasör sıkıştırılırken bir hata oluştu',
            error_extracting: 'Çıkartılırken bir hata oluştu',
            error_creating_folder: 'Klasör oluşturulurken bir hata oluştu',
            error_getting_content: 'Dosya detayları alınırken bir hata oluştu',
            error_changing_perms: 'Dosyanın izini değiştirilirken bir hata oluştu',
            error_uploading_files: 'Dosyalar yüklenirken bir hata oluştu',
            sure_to_start_compression_with: 'Sıkıştırmak istediğinden emin misin',
            owner: 'Sahip',
            group: 'Grup',
            others: 'Diğerleri',
            read: 'Okuma',
            write: 'Yazma',
            exec: 'Gerçekleştir',
            original: 'Orjinal',
            changes: 'Değişiklikler',
            recursive: 'Yinemeli',
            preview: 'Dosyayı önizle',
            open: 'Aç',
            these_elements: '{{total}} eleman',
            new_folder: 'Yeni Klasör',
            download_as_zip: 'ZIP olarak indir'
        });

        $translateProvider.translations('fa', {
            filemanager: 'مدیریت فایل ها',
            language: 'زبان',
            english: 'انگلیسی',
            spanish: 'اسپانیایی',
            portuguese: 'پرتغالی',
            french: 'فرانسه',
            german: 'آلمانی',
            hebrew: 'عبری',
            italian: 'ایتالیایی',
            slovak: 'اسلواک',
            chinese: 'چینی',
            russian: 'روسی',
            ukrainian: 'اوکراینی',
            turkish: 'ترکی',
            persian: 'فارسی',
            polish: 'لهستانی',
            confirm: 'تایید',
            cancel: 'رد',
            close: 'بستن',
            upload_files: 'آپلود فایل',
            files_will_uploaded_to: 'فایل ها آپلود می شوند به',
            select_files: 'انتخاب فایل ها',
            uploading: 'در حال آپلود',
            permissions: 'مجوز ها',
            select_destination_folder: 'پوشه مقصد را انتخاب کنید',
            source: 'مبدا',
            destination: 'مقصد',
            copy_file: 'کپی فایل',
            sure_to_delete: 'مطمين هستید می خواهید حذف کنید؟',
            change_name_move: 'تغییر نام و جابجایی',
            enter_new_name_for: 'نام جدیدی وارد کنید برای',
            extract_item: 'خارج کردن از حالت فشرده',
            extraction_started: 'یک پروسه در پس زمینه شروع به خارج کردن از حالت فشرده کرد',
            compression_started: 'یک پروسه در پس زمینه شروع به فشرده سازی کرد',
            enter_folder_name_for_extraction: 'نام پوشه مقصد برای خارج کردن از حالت فشرده را وارد کنید',
            enter_file_name_for_compression: 'نام پوشه مقصد برای فشرده سازی را وارد کنید',
            toggle_fullscreen: 'تعویض حالت تمام صفحه',
            edit_file: 'ویرایش',
            file_content: 'محتویات',
            loading: 'در حال بارگذاری',
            search: 'جستجو',
            create_folder: 'پوشه جدید',
            create: 'ساختن',
            folder_name: 'نام پوشه',
            upload: 'آپلود',
            change_permissions: 'تغییر مجوز ها',
            change: 'تغییر',
            details: 'جزییات',
            icons: 'آیکون ها',
            list: 'لیست',
            name: 'نام',
            size: 'سایز',
            actions: 'اعمال',
            date: 'تاریخ',
            selection: 'انتخاب',
            no_files_in_folder: 'هیچ فایلی در این پوشه نیست',
            no_folders_in_folder: 'هیچ پوشه ای داخل این پوشه قرار ندارد',
            select_this: 'انتخاب',
            go_back: 'بازگشت',
            wait: 'منتظر بمانید',
            move: 'جابجایی',
            download: 'دانلود',
            view_item: 'مشاهده این مورد',
            remove: 'حذف',
            edit: 'ویرایش',
            copy: 'کپی',
            rename: 'تغییر نام',
            extract: 'خروج از حالت فشرده',
            compress: 'فشرده سازی',
            error_invalid_filename: 'نام فایل مورد درست نیست و یا قبلا استفاده شده است، لطفا نام دیگری وارد کنید',
            error_modifying: 'در هنگام تغییر فایل خطایی پیش آمد',
            error_deleting: 'در هنگام حذف فایل خطایی پیش آمد',
            error_renaming: 'در هنگام تغییر نام فایل خطایی پیش آمد',
            error_copying: 'در هنگام کپی کردن فایل خطایی پیش آمد',
            error_compressing: 'در هنگام فشرده سازی فایل خطایی پیش آمد',
            error_extracting: 'در هنگام خارک کردن فایل از حالت فشرده خطایی پیش آمد',
            error_creating_folder: 'در هنگام ساخت پوشه خطایی پیش امد',
            error_getting_content: 'در هنگام بارگذاری محتویات فایل خطایی رخ داد',
            error_changing_perms: 'در هنگام تغییر مجوز های فایل خطایی رخ داد',
            error_uploading_files: 'در آپلود فایل خطایی رخ داد',
            sure_to_start_compression_with: 'مطمئن هستید فشرده سازی انجام شد؟',
            owner: 'مالک فایل',
            group: 'گروه',
            others: 'دیگران',
            read: 'خواندن',
            write: 'نوشتن',
            exec: 'اجرا کردن',
            original: 'اصلی',
            changes: 'تغییرات',
            recursive: 'بازگشتی',
            preview: 'پیش نمایش',
            open: 'باز کردن',
            these_elements: 'تعداد {{total}} مورد',
            new_folder: 'پوشه جدید',
            download_as_zip: 'به عنوان فایل فشرده دانلود شود'
        });

        $translateProvider.translations('pl', {
            filemanager: 'Menadżer plików',
            language: 'Język',
            english: 'Angielski',
            spanish: 'Hiszpański',
            portuguese: 'Portugalski',
            french: 'Francuski',
            german: 'Niemiecki',
            hebrew: 'Hebrajski',
            italian: 'Włoski',
            slovak: 'Słowacki',
            chinese: 'Chiński',
            russian: 'Rosyjski',
            ukrainian: 'Ukraiński',
            turkish: 'Turecki',
            persian: 'Perski',
            polish: 'Polski',
            confirm: 'Potwierdź',
            cancel: 'Anuluj',
            close: 'Zamknij',
            upload_files: 'Wgraj pliki',
            files_will_uploaded_to: 'Pliki będą umieszczone w katalogu',
            select_files: 'Wybierz pliki',
            uploading: 'Ładowanie',
            permissions: 'Uprawnienia',
            select_destination_folder: 'Wybierz folder docelowy',
            source: 'Źródło',
            destination: 'Cel',
            copy_file: 'Kopiuj plik',
            sure_to_delete: 'Jesteś pewien, że chcesz skasować',
            change_name_move: 'Zmień nazwę / przenieś',
            enter_new_name_for: 'Wpisz nową nazwę dla',
            extract_item: 'Rozpakuj element',
            extraction_started: 'Rozpakowywanie rozpoczęło się w tle',
            compression_started: 'Kompresowanie rozpoczęło się w tle',
            enter_folder_name_for_extraction: 'Wpisz nazwę folderu do rozpakowania',
            enter_file_name_for_compression: 'Wpisz nazwę folderu do skompresowania',
            toggle_fullscreen: 'Tryb pełnoekranowy',
            edit_file: 'Edytuj plik',
            file_content: 'Zawartość pliku',
            loading: 'Ładowanie',
            search: 'Szukaj',
            create_folder: 'Stwórz folder',
            create: 'Utwórz',
            folder_name: 'Nazwa folderu',
            upload: 'Wgraj',
            change_permissions: 'Zmień uprawnienia',
            change: 'Zmień',
            details: 'Szczegóły',
            icons: 'Ikony',
            list: 'Lista',
            name: 'Nazwa',
            size: 'Rozmiar',
            actions: 'Akcje',
            date: 'Data',
            selection: 'Zaznaczone',
            no_files_in_folder: 'Brak plików w tym folderze',
            no_folders_in_folder: 'Ten folder nie zawiera podfolderów',
            select_this: 'Wybierz ten',
            go_back: 'W górę',
            wait: 'Wait',
            move: 'Przenieś',
            download: 'Pobierz',
            view_item: 'Wyświetl',
            remove: 'Usuń',
            edit: 'Edycja',
            copy: 'Kopiuj',
            rename: 'Zmień nazwę',
            extract: 'Rozpakuj',
            compress: 'Skompresuj',
            error_invalid_filename: 'Błędna nazwa pliku lub plik o takiej nazwie już istnieje, proszę użyć innej nazwy',
            error_modifying: 'Wystąpił błąd podczas modyfikowania pliku',
            error_deleting: 'Wystąpił błąd podczas usuwania pliku lub folderu',
            error_renaming: 'Wystąpił błąd podczas zmiany nazwy pliku',
            error_copying: 'Wystąpił błąd podczas kopiowania pliku',
            error_compressing: 'Wystąpił błąd podczas kompresowania pliku lub folderu',
            error_extracting: 'Wystąpił błąd podczas rozpakowywania pliku',
            error_creating_folder: 'Wystąpił błąd podczas tworzenia nowego folderu',
            error_getting_content: 'Wystąpił błąd podczas pobierania zawartości pliku',
            error_changing_perms: 'Wystąpił błąd podczas zmiany uprawnień pliku',
            error_uploading_files: 'Wystąpił błąd podczas wgrywania plików',
            sure_to_start_compression_with: 'Jesteś pewien, że chcesz skompresować',
            owner: 'Właściciel',
            group: 'Grupa',
            others: 'Inni',
            read: 'Odczyt',
            write: 'Zapis',
            exec: 'Wykonywanie',
            original: 'Oryginał',
            changes: 'Zmiany',
            recursive: 'Rekursywnie',
            preview: 'Podgląd elementu',
            open: 'Otwórz',
            these_elements: 'te {{total}} elementy?',
            new_folder: 'Nowy folder',
            download_as_zip: 'Pobierz jako ZIP'
        });

        $translateProvider.translations('it', {
            filemanager: 'Gestore File',
            language: 'Lingua',
            english: 'Inglese',
            spanish: 'Spagnolo',
            portuguese: 'Portoghese',
            french: 'Francese',
            german: 'Tedesco',
            hebrew: 'Ebraico',
            slovak: 'Slovacco',
            chinese: 'Cinese',
            russian: 'Russo',
            ukrainian: 'Ucraino',
            turkish: 'Turco',
            persian: 'Persiano',
            polish: 'Polacco',
            confirm: 'Conferma',
            cancel: 'Annulla',
            close: 'Chiudi',
            upload_files: 'Carica files',
            files_will_uploaded_to: 'I files saranno caricati in',
            select_files: 'Seleziona i files',
            uploading: 'Trasferimento',
            permissions: 'Permessi',
            select_destination_folder: 'Select carterlla di destinazione',
            source: 'Sorgente',
            destination: 'Destinazione',
            copy_file: 'Copia file',
            sure_to_delete: 'Sicuro di voler eliminare',
            change_name_move: 'Rinomina / sposta',
            enter_new_name_for: 'Inserisci nuovo nome per',
            extract_item: 'Estrai elemento',
            extraction_started: 'Decompressione avviata da un processo in background',
            compression_started: 'Compressione avviata da un processo in background',
            enter_folder_name_for_extraction: 'Inserisci nome cartella per l\'estrazione di',
            enter_file_name_for_compression: 'Inserisci nome file per la compressione di',
            toggle_fullscreen: 'Passa a schermo intero',
            edit_file: 'Modifica file',
            file_content: 'Contenuto del file',
            loading: 'Caricamento',
            search: 'Cerca',
            create_folder: 'Crea cartella',
            create: 'Crea',
            folder_name: 'Nome cartella',
            upload: 'Upload',
            change_permissions: 'Modifica permessi',
            change: 'Modifica',
            details: 'Dettagli',
            icons: 'Icone',
            list: 'Lista',
            name: 'Nome',
            size: 'Dimensione',
            actions: 'Azioni',
            date: 'Data',
            selection: 'Selezione',
            no_files_in_folder: 'Nessun file nella cartella',
            no_folders_in_folder: 'Questa cartella non contiene altre cartelle',
            select_this: 'Seleziona questo',
            go_back: 'Indietro',
            wait: 'Attendere',
            move: 'Sposta',
            download: 'Scarica',
            view_item: 'Visualizza elemento',
            remove: 'Elimina',
            edit: 'Modifica',
            copy: 'Copia',
            rename: 'Rinomina',
            extract: 'Estrai',
            compress: 'Comprimi',
            error_invalid_filename: 'Nome file non valido o già esistente, specificarne un\'altro',
            error_modifying: 'Errore durante la modifica del file',
            error_deleting: 'Errore durante l\'eliminazione del file o della cartella',
            error_renaming: 'Errore durante la rinomina del file',
            error_copying: 'Errore durante la copia del file',
            error_compressing: 'Errore durante la compressione del file o della cartella',
            error_extracting: 'Errore durante l\'estrazione del file',
            error_creating_folder: 'Errore nella creazione della cartella',
            error_getting_content: 'Errore nel recupero del contenuto del file',
            error_changing_perms: 'Errore durante la modifica dei permessi del file',
            error_uploading_files: 'Errore durante il trasferimento dei files',
            sure_to_start_compression_with: 'Sicuro di voler comprimere',
            owner: 'Proprietario',
            group: 'Gruppo',
            others: 'Altri',
            read: 'Lettura',
            write: 'Scrittura',
            exec: 'Esecuzione',
            original: 'Originario',
            changes: 'Cambiamenti',
            recursive: 'Ricorsivo',
            preview: 'Anteprima',
            open: 'Apri',
            these_elements: 'questi {{total}} elementi',
            new_folder: 'Nuova cartella',
            download_as_zip: 'Scarica come file ZIP'
        });

    }]);
})(angular);

(function(angular) {
    'use strict';
    var app = angular.module('FileManagerApp');

    app.filter('strLimit', ['$filter', function($filter) {
        return function(input, limit, more) {
            if (input.length <= limit) {
                return input;
            }
            return $filter('limitTo')(input, limit) + (more || '...');
        };
    }]);

    app.filter('fileExtension', ['$filter', function($filter) {
        return function(input) {
            return /\./.test(input) && $filter('strLimit')(input.split('.').pop(), 3, '..') || '';
        };
    }]);

    app.filter('formatDate', ['$filter', function() {
        return function(input) {
            return input instanceof Date ?
                input.toISOString().substring(0, 19).replace('T', ' ') :
                (input.toLocaleString || input.toString).apply(input);
        };
    }]);

    app.filter('humanReadableFileSize', ['$filter', 'fileManagerConfig', function($filter, fileManagerConfig) {
      // See https://en.wikipedia.org/wiki/Binary_prefix
      var decimalByteUnits = [' kB', ' MB', ' GB', ' TB', 'PB', 'EB', 'ZB', 'YB'];
      var binaryByteUnits = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

      return function(input) {
        var i = -1;
        var fileSizeInBytes = input;

        do {
          fileSizeInBytes = fileSizeInBytes / 1024;
          i++;
        } while (fileSizeInBytes > 1024);

        var result = fileManagerConfig.useBinarySizePrefixes ? binaryByteUnits[i] : decimalByteUnits[i];
        return Math.max(fileSizeInBytes, 0.1).toFixed(1) + ' ' + result;
      };
    }]);
})(angular);

(function(angular, $) {
    'use strict';
    angular.module('FileManagerApp').service('apiHandler', ['$http', '$q', '$window', '$translate', 'Upload',
        function ($http, $q, $window, $translate, Upload) {

        $http.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

        var ApiHandler = function() {
            this.inprocess = false;
            this.asyncSuccess = false;
            this.error = '';
        };

        ApiHandler.prototype.deferredHandler = function(data, deferred, code, defaultMsg) {
            if (!data || typeof data !== 'object') {
                this.error = 'Error %s - Bridge response error, please check the API docs or this ajax response.'.replace('%s', code);
            }
            if (code == 404) {
                this.error = 'Error 404 - Backend bridge is not working, please check the ajax response.';
            }
            if (data.result && data.result.error) {
                this.error = data.result.error;
            }
            if (!this.error && data.error) {
                this.error = data.error.message;
            }
            if (!this.error && defaultMsg) {
                this.error = defaultMsg;
            }
            if (this.error) {
                return deferred.reject(data);
            }
            return deferred.resolve(data);
        };

        ApiHandler.prototype.list = function(apiUrl, path, customDeferredHandler, exts) {
            var self = this;
            var dfHandler = customDeferredHandler || self.deferredHandler;
            var deferred = $q.defer();
            var data = {
                action: 'list',
                path: path,
                fileExtensions: exts && exts.length ? exts : undefined
            };

            self.inprocess = true;
            self.error = '';

            $http.post(apiUrl, data).success(function(data, code) {
                dfHandler(data, deferred, code);
            }).error(function(data, code) {
                dfHandler(data, deferred, code, 'Unknown error listing, check the response');
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.copy = function(apiUrl, items, path, singleFilename) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'copy',
                items: items,
                newPath: path
            };

            if (singleFilename && items.length === 1) {
                data.singleFilename = singleFilename;
            }
            
            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_copying'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.move = function(apiUrl, items, path) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'move',
                items: items,
                newPath: path
            };
            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_moving'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.remove = function(apiUrl, items) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'remove',
                items: items
            };

            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_deleting'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.upload = function(apiUrl, destination, files) {
            var self = this;
            var deferred = $q.defer();
            self.inprocess = true;
            self.progress = 0;
            self.error = '';

            var data = {
                destination: destination
            };

            for (var i = 0; i < files.length; i++) {
                data['file-' + i] = files[i];
            }

            if (files && files.length) {
                Upload.upload({
                    url: apiUrl,
                    data: data
                }).then(function (data) {
                    self.deferredHandler(data.data, deferred, data.status);
                }, function (data) {
                    self.deferredHandler(data.data, deferred, data.status, 'Unknown error uploading files');
                }, function (evt) {
                    self.progress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total)) - 1;
                })['finally'](function() {
                    self.inprocess = false;
                    self.progress = 0;
                });
            }

            return deferred.promise;
        };

        ApiHandler.prototype.getContent = function(apiUrl, itemPath) {            
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'getContent',
                item: itemPath
            };

            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_getting_content'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.edit = function(apiUrl, itemPath, content) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'edit',
                item: itemPath,
                content: content
            };

            self.inprocess = true;
            self.error = '';

            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_modifying'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.rename = function(apiUrl, itemPath, newPath) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'rename',
                item: itemPath,
                newItemPath: newPath
            };
            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_renaming'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.getUrl = function(apiUrl, path) {
            var data = {
                action: 'download',
                path: path
            };
            return path && [apiUrl, $.param(data)].join('?');
        };

        ApiHandler.prototype.download = function(apiUrl, itemPath, toFilename, downloadByAjax, forceNewWindow) {
            console.log(apiUrl,' ', itemPath, ' ', toFilename, ' ', downloadByAjax, ' ', forceNewWindow);
            var self = this;
            var url = this.getUrl(apiUrl, itemPath);

            if (!downloadByAjax || forceNewWindow || !$window.saveAs) {
                !$window.saveAs && $window.console.log('Your browser dont support ajax download, downloading by default');
                return !!$window.open(url, '_blank', '');
            }
            
            var deferred = $q.defer();
            self.inprocess = true;
            $http.get(url).success(function(data) {
                var bin = new $window.Blob([data]);
                deferred.resolve(data);
                $window.saveAs(bin, toFilename);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_downloading'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.downloadMultiple = function(apiUrl, items, toFilename, downloadByAjax, forceNewWindow) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'downloadMultiple',
                items: items,
                toFilename: toFilename
            };
            var url = [apiUrl, $.param(data)].join('?');

            if (!downloadByAjax || forceNewWindow || !$window.saveAs) {
                !$window.saveAs && $window.console.log('Your browser dont support ajax download, downloading by default');
                return !!$window.open(url, '_blank', '');
            }
            
            self.inprocess = true;
            $http.get(apiUrl).success(function(data) {
                var bin = new $window.Blob([data]);
                deferred.resolve(data);
                $window.saveAs(bin, toFilename);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_downloading'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.compress = function(apiUrl, items, compressedFilename, path) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'compress',
                items: items,
                destination: path,
                compressedFilename: compressedFilename
            };

            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_compressing'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.extract = function(apiUrl, item, folderName, path) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'extract',
                item: item,
                destination: path,
                folderName: folderName
            };

            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_extracting'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.changePermissions = function(apiUrl, items, permsOctal, permsCode, recursive) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'changePermissions',
                items: items,
                perms: permsOctal,
                permsCode: permsCode,
                recursive: !!recursive
            };
            
            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_changing_perms'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.createFolder = function(apiUrl, path) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'createFolder',
                newPath: path
            };

            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_creating_folder'));
            })['finally'](function() {
                self.inprocess = false;
            });
        
            return deferred.promise;
        };

        return ApiHandler;

    }]);
})(angular, jQuery);
(function(angular) {
    'use strict';
    angular.module('FileManagerApp').service('apiMiddleware', ['$window', 'fileManagerConfig', 'apiHandler', 
        function ($window, fileManagerConfig, ApiHandler) {

        var ApiMiddleware = function() {
            this.apiHandler = new ApiHandler();
        };

        ApiMiddleware.prototype.getPath = function(arrayPath) {
            return '/' + arrayPath.join('/');
        };

        ApiMiddleware.prototype.getFileList = function(files) {
            return (files || []).map(function(file) {
                return file && file.model.fullPath();
            });
        };

        ApiMiddleware.prototype.getFilePath = function(item) {
            return item && item.model.fullPath();
        };

        ApiMiddleware.prototype.list = function(path, customDeferredHandler) {
            return this.apiHandler.list(fileManagerConfig.listUrl, this.getPath(path), customDeferredHandler);
        };

        ApiMiddleware.prototype.copy = function(files, path) {
            var items = this.getFileList(files);
            var singleFilename = items.length === 1 ? files[0].tempModel.name : undefined;
            return this.apiHandler.copy(fileManagerConfig.copyUrl, items, this.getPath(path), singleFilename);
        };

        ApiMiddleware.prototype.move = function(files, path) {
            var items = this.getFileList(files);
            return this.apiHandler.move(fileManagerConfig.moveUrl, items, this.getPath(path));
        };

        ApiMiddleware.prototype.remove = function(files) {
            var items = this.getFileList(files);
            return this.apiHandler.remove(fileManagerConfig.removeUrl, items);
        };

        ApiMiddleware.prototype.removeFromUploadForm = function(file) {
            return this.apiHandler.remove(fileManagerConfig.removeFromUploadFormUrl, file);
        };

        ApiMiddleware.prototype.upload = function(files, path) {
            if (! $window.FormData) {
                throw new Error('Unsupported browser version');
            }

            var destination = this.getPath(path);

            return this.apiHandler.upload(fileManagerConfig.uploadUrl, destination, files);
        };

        ApiMiddleware.prototype.getContent = function(item) {
            var itemPath = this.getFilePath(item);
            return this.apiHandler.getContent(fileManagerConfig.getContentUrl, itemPath);
        };

        ApiMiddleware.prototype.edit = function(item) {
            var itemPath = this.getFilePath(item);
            return this.apiHandler.edit(fileManagerConfig.editUrl, itemPath, item.tempModel.content);
        };

        ApiMiddleware.prototype.rename = function(item) {
            var itemPath = this.getFilePath(item);
            var newPath = item.tempModel.fullPath();

            return this.apiHandler.rename(fileManagerConfig.renameUrl, itemPath, newPath);
        };

        ApiMiddleware.prototype.getUrl = function(item) {
            var itemPath = this.getFilePath(item);
            return this.apiHandler.getUrl(fileManagerConfig.downloadFileUrl, itemPath);
        };

        ApiMiddleware.prototype.download = function(item, forceNewWindow) {
            //TODO: add spinner to indicate file is downloading
            var itemPath = this.getFilePath(item);
            var toFilename = item.model.name;
            if (item.isFolder()) {
                return;
            }
            
            return this.apiHandler.download(
                fileManagerConfig.downloadFileUrl, 
                itemPath,
                toFilename,
                fileManagerConfig.downloadFilesByAjax,
                forceNewWindow
            );
        };

        ApiMiddleware.prototype.downloadMultiple = function(files, forceNewWindow) {
            var items = this.getFileList(files);
            var timestamp = new Date().getTime().toString().substr(8, 13);
            var toFilename = timestamp + '-' + fileManagerConfig.multipleDownloadFileName;
            
            return this.apiHandler.downloadMultiple(
                fileManagerConfig.downloadMultipleUrl, 
                items, 
                toFilename, 
                fileManagerConfig.downloadFilesByAjax,
                forceNewWindow
            );
        };

        ApiMiddleware.prototype.compress = function(files, compressedFilename, path) {
            var items = this.getFileList(files);
            return this.apiHandler.compress(fileManagerConfig.compressUrl, items, compressedFilename, this.getPath(path));
        };

        ApiMiddleware.prototype.extract = function(item, folderName, path) {
            var itemPath = this.getFilePath(item);
            return this.apiHandler.extract(fileManagerConfig.extractUrl, itemPath, folderName, this.getPath(path));
        };

        ApiMiddleware.prototype.changePermissions = function(files, dataItem) {
            var items = this.getFileList(files);
            var code = dataItem.tempModel.perms.toCode();
            var octal = dataItem.tempModel.perms.toOctal();
            var recursive = !!dataItem.tempModel.recursive;

            return this.apiHandler.changePermissions(fileManagerConfig.permissionsUrl, items, code, octal, recursive);
        };

        ApiMiddleware.prototype.createFolder = function(item) {
            var path = item.tempModel.fullPath();
            return this.apiHandler.createFolder(fileManagerConfig.createFolderUrl, path);
        };

        return ApiMiddleware;

    }]);
})(angular);
(function(angular) {
    'use strict';
    angular.module('FileManagerApp').service('fileNavigator', [
        'apiMiddleware', 'fileManagerConfig', 'item', function (ApiMiddleware, fileManagerConfig, Item) {

        var FileNavigator = function() {
            this.apiMiddleware = new ApiMiddleware();
            this.requesting = false;
            this.fileList = [];
            this.currentPath = this.getBasePath();
            this.history = [];
            this.error = '';

            this.onRefresh = function() {};
        };

        FileNavigator.prototype.getBasePath = function() {
            var path = (fileManagerConfig.basePath || '').replace(/^\//, '');
            return path.trim() ? path.split('/') : [];
        };

        FileNavigator.prototype.deferredHandler = function(data, deferred, code, defaultMsg) {
            if (!data || typeof data !== 'object') {
                this.error = 'Error %s - Bridge response error, please check the API docs or this ajax response.'.replace('%s', code);
            }
            if (code == 404) {
                this.error = 'Error 404 - Backend bridge is not working, please check the ajax response.';
            }
            if (code == 200) {
                this.error = null;
            }
            if (!this.error && data.result && data.result.error) {
                this.error = data.result.error;
            }
            if (!this.error && data.error) {
                this.error = data.error.message;
            }
            if (!this.error && defaultMsg) {
                this.error = defaultMsg;
            }
            if (this.error) {
                return deferred.reject(data);
            }
            return deferred.resolve(data);
        };

        FileNavigator.prototype.list = function() {
            return this.apiMiddleware.list(this.currentPath, this.deferredHandler.bind(this));
        };

        FileNavigator.prototype.refresh = function() {
            var self = this;
            if (! self.currentPath.length) {
                self.currentPath = this.getBasePath();
            }
            var path = self.currentPath.join('/');
            self.requesting = true;
            self.fileList = [];
            return self.list().then(function(data) {
                self.fileList = (data.result || []).map(function(file) {
                    return new Item(file, self.currentPath);
                });
                self.buildTree(path);
                self.onRefresh();
            }).finally(function() {
                self.requesting = false;
            });
        };
        
        FileNavigator.prototype.buildTree = function(path) {
            var flatNodes = [], selectedNode = {};

            function recursive(parent, item, path) {
                var absName = path ? (path + '/' + item.model.name) : item.model.name;
                if (parent.name && parent.name.trim() && path.trim().indexOf(parent.name) !== 0) {
                    parent.nodes = [];
                }
                if (parent.name !== path) {
                    parent.nodes.forEach(function(nd) {
                        recursive(nd, item, path);
                    });
                } else {
                    for (var e in parent.nodes) {
                        if (parent.nodes[e].name === absName) {
                            return;
                        }
                    }
                    parent.nodes.push({item: item, name: absName, nodes: []});
                }
                
                parent.nodes = parent.nodes.sort(function(a, b) {
                    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() === b.name.toLowerCase() ? 0 : 1;
                });
            }

            function flatten(node, array) {
                array.push(node);
                for (var n in node.nodes) {
                    flatten(node.nodes[n], array);
                }
            }

            function findNode(data, path) {
                return data.filter(function (n) {
                    return n.name === path;
                })[0];
            }

            //!this.history.length && this.history.push({name: '', nodes: []});
            !this.history.length && this.history.push({ name: this.getBasePath()[0] || '', nodes: [] });
            flatten(this.history[0], flatNodes);
            selectedNode = findNode(flatNodes, path);
            selectedNode && (selectedNode.nodes = []);

            for (var o in this.fileList) {
                var item = this.fileList[o];
                item instanceof Item && item.isFolder() && recursive(this.history[0], item, path);
            }
        };

        FileNavigator.prototype.folderClick = function(item) {
            this.currentPath = [];
            if (item && item.isFolder()) {
                this.currentPath = item.model.fullPath().split('/').splice(1);
            }
            this.refresh();
        };

        FileNavigator.prototype.upDir = function() {
            if (this.currentPath[0]) {
                this.currentPath = this.currentPath.slice(0, -1);
                this.refresh();
            }
        };

        FileNavigator.prototype.goTo = function(index) {
            this.currentPath = this.currentPath.slice(0, index + 1);
            this.refresh();
        };

        FileNavigator.prototype.fileNameExists = function(fileName) {
            return this.fileList.find(function(item) {
                return fileName && item.model.name.trim() === fileName.trim();
            });
        };

        FileNavigator.prototype.listHasFolders = function() {
            return this.fileList.find(function(item) {
                return item.model.type === 'dir';
            });
        };

        FileNavigator.prototype.getCurrentFolderName = function() {
            return this.currentPath.slice(-1)[0] || '/';
        };

        return FileNavigator;
    }]);
})(angular);

angular.module("FileManagerApp").run(["$templateCache", function($templateCache) {$templateCache.put("src/templates/current-folder-breadcrumb.html","<ol class=\"breadcrumb\">\n    <li>\n        <a href=\"\" ng-click=\"fileNavigator.goTo(-1)\">\n            SalesDrive\n        </a>\n    </li>\n    <li ng-repeat=\"(key, dir) in fileNavigator.currentPath track by key\" ng-class=\"{\'active\':$last}\" class=\"animated fast fadeIn\">\n        <a href=\"\" ng-show=\"!$last\" ng-click=\"fileNavigator.goTo(key)\">\n            {{dir | strLimit : 8}}\n        </a>\n        <span ng-show=\"$last\">\n            {{dir | strLimit : 12}}\n        </span>\n    </li>\n</ol>");
$templateCache.put("src/templates/item-context-menu.html","<div id=\"context-menu\" class=\"dropdown clearfix animated fast fadeIn\">\n    <ul class=\"dropdown-menu dropdown-right-click\" role=\"menu\" aria-labelledby=\"dropdownMenu\" ng-show=\"temps.length\">\n\n        <li ng-show=\"singleSelection() && singleSelection().isFolder()\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"smartClick(singleSelection())\">\n                <i class=\"glyphicon glyphicon-folder-open\"></i> {{\'open\' | translate}}\n            </a>\n        </li>\n\n        <li ng-show=\"config.pickCallback && singleSelection() && singleSelection().isSelectable()\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"config.pickCallback(singleSelection().model)\">\n                <i class=\"glyphicon glyphicon-hand-up\"></i> {{\'select_this\' | translate}}\n            </a>\n        </li>\n\n        <li ng-show=\"config.allowedActions.download && !selectionHas(\'dir\') && singleSelection()\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"download()\">\n                <i class=\"glyphicon glyphicon-cloud-download\"></i> {{\'download\' | translate}}\n            </a>\n        </li>\n\n        <li ng-show=\"config.allowedActions.downloadMultiple && !selectionHas(\'dir\') && !singleSelection()\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"download()\">\n                <i class=\"glyphicon glyphicon-cloud-download\"></i> {{\'download_as_zip\' | translate}}\n            </a>\n        </li>\n\n        <li ng-show=\"config.allowedActions.preview && singleSelection().isImage() && singleSelection()\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"openImagePreview()\">\n                <i class=\"glyphicon glyphicon-picture\"></i> {{\'view_item\' | translate}}\n            </a>\n        </li>\n\n        <li ng-show=\"config.allowedActions.rename && singleSelection()\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"modal(\'rename\')\">\n                <i class=\"glyphicon glyphicon-edit\"></i> {{\'rename\' | translate}}\n            </a>\n        </li>\n\n        <li ng-show=\"config.allowedActions.move\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"modalWithPathSelector(\'move\')\">\n                <i class=\"glyphicon glyphicon-arrow-right\"></i> {{\'move\' | translate}}\n            </a>\n        </li>\n\n        <li ng-show=\"config.allowedActions.copy && !selectionHas(\'dir\')\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"modalWithPathSelector(\'copy\')\">\n                <i class=\"glyphicon glyphicon-log-out\"></i> {{\'copy\' | translate}}\n            </a>\n        </li>\n\n        <li ng-show=\"config.allowedActions.edit && singleSelection() && singleSelection().isEditable()\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"openEditItem()\">\n                <i class=\"glyphicon glyphicon-pencil\"></i> {{\'edit\' | translate}}\n            </a>\n        </li>\n\n        <li ng-show=\"config.allowedActions.changePermissions\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"modal(\'changepermissions\')\">\n                <i class=\"glyphicon glyphicon-lock\"></i> {{\'permissions\' | translate}}\n            </a>\n        </li>\n\n        <li ng-show=\"config.allowedActions.compress && (!singleSelection() || selectionHas(\'dir\'))\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"modal(\'compress\')\">\n                <i class=\"glyphicon glyphicon-compressed\"></i> {{\'compress\' | translate}}\n            </a>\n        </li>\n\n        <li ng-show=\"config.allowedActions.extract && singleSelection() && singleSelection().isExtractable()\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"modal(\'extract\')\">\n                <i class=\"glyphicon glyphicon-export\"></i> {{\'extract\' | translate}}\n            </a>\n        </li>\n\n        <li class=\"divider\" ng-show=\"config.allowedActions.remove\"></li>\n        \n        <li ng-show=\"config.allowedActions.remove\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"modal(\'remove\')\">\n                <i class=\"glyphicon glyphicon-trash\"></i> {{\'remove\' | translate}}\n            </a>\n        </li>\n\n    </ul>\n\n    <ul class=\"dropdown-menu dropdown-right-click\" role=\"menu\" aria-labelledby=\"dropdownMenu\" ng-show=\"!temps.length\">\n        <li ng-show=\"config.allowedActions.createFolder\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"modal(\'newfolder\') && prepareNewFolder()\">\n                <i class=\"glyphicon glyphicon-plus\"></i> {{\'new_folder\' | translate}}\n            </a>\n        </li>\n        <li ng-show=\"config.allowedActions.upload\">\n            <a href=\"\" tabindex=\"-1\" ng-click=\"modal(\'uploadfile\')\">\n                <i class=\"glyphicon glyphicon-cloud-upload\"></i> {{\'upload_files\' | translate}}\n            </a>\n        </li>\n    </ul>\n</div>");
$templateCache.put("src/templates/main-icons.html","<div class=\"iconset noselect\">\n    <div ng-show=\"showUploadBar\">\n        <p class=\"thumbnail\">Queue progress:</p>\n        <div class=\"progress\" style=\"margin-bottom:20px\">\n            <div class=\"progress-bar\" role=\"progressbar\" ng-style=\"{ \'width\': uploader.progress + \'%\' }\"\n                 style=\"width: 0%;background:#93c308\"></div>\n            {{uploader.progress + \'%\'}}\n        </div>\n    </div>\n    <div class=\"item-list clearfix\" ng-click=\"selectOrUnselect(null, $event)\" ng-right-click=\"selectOrUnselect(null, $event)\" prevent=\"true\">\n        <div class=\"col-120\" ng-repeat=\"item in $parent.fileList = (fileNavigator.fileList | filter: {model:{name: query}})\" ng-show=\"!fileNavigator.requesting && !fileNavigator.error\">\n            <a href=\"\" class=\"thumbnail text-center\" ng-click=\"selectOrUnselect(item, $event)\" ng-dblclick=\"smartClick(item)\" ng-right-click=\"selectOrUnselect(item, $event)\" title=\"{{item.model.name}} ({{item.model.size | humanReadableFileSize}})\" ng-class=\"{selected: isSelected(item)}\">\n                <div class=\"item-icon\">\n                    <i class=\"glyphicon glyphicon-folder-open\" ng-show=\"item.model.type === \'dir\'\"></i>\n                    <i class=\"glyphicon glyphicon-file\" data-ext=\"{{ item.model.name | fileExtension }}\" ng-show=\"item.model.type === \'file\'\" ng-class=\"{\'item-extension\': config.showExtensionIcons}\"></i>\n                </div>\n                {{item.model.name | strLimit : 11 }}\n            </a>\n        </div>\n    </div>\n\n    <div ng-show=\"fileNavigator.requesting\">\n        <div ng-include=\"config.tplPath + \'/spinner.html\'\"></div>\n    </div>\n\n    <div class=\"alert alert-warning\" ng-show=\"!fileNavigator.requesting && fileNavigator.fileList.length < 1 && !fileNavigator.error\">\n        {{\"no_files_in_folder\" | translate}}...\n    </div>\n    \n    <div class=\"alert alert-danger\" ng-show=\"!fileNavigator.requesting && fileNavigator.error\">\n        {{ fileNavigator.error }}\n    </div>\n</div>");
$templateCache.put("src/templates/main-table-modal.html","<table class=\"table table-condensed table-modal-condensed mb0\">\n    <thead>\n        <tr>\n            <th>\n                <a href=\"\" ng-click=\"order(\'model.name\')\">\n                    {{\"name\" | translate}}\n                    <span class=\"sortorder\" ng-show=\"predicate[1] === \'model.name\'\" ng-class=\"{reverse:reverse}\"></span>\n                </a>\n            </th>\n            <th class=\"text-right\"></th>\n        </tr>\n    </thead>\n    <tbody class=\"file-item\">\n        <tr ng-show=\"fileNavigator.requesting\">\n            <td colspan=\"2\">\n                <div ng-include=\"config.tplPath + \'/spinner.html\'\"></div>\n            </td>\n        </tr>\n        <tr ng-show=\"!fileNavigator.requesting && !fileNavigator.listHasFolders() && !fileNavigator.error\">\n            <td>\n                {{\"no_folders_in_folder\" | translate}}...\n            </td>\n            <td class=\"text-right\">\n                <button class=\"btn btn-sm btn-default\" ng-click=\"fileNavigator.upDir()\">{{\"go_back\" | translate}}</button>\n            </td>\n        </tr>\n        <tr ng-show=\"!fileNavigator.requesting && fileNavigator.error\">\n            <td colspan=\"2\">\n                {{ fileNavigator.error }}\n            </td>\n        </tr>\n        <tr ng-repeat=\"item in fileNavigator.fileList | orderBy:predicate:reverse\" ng-show=\"!fileNavigator.requesting && item.model.type === \'dir\'\" ng-if=\"!selectedFilesAreChildOfPath(item)\">\n            <td>\n                <a href=\"\" ng-click=\"fileNavigator.folderClick(item)\" title=\"{{item.model.name}} ({{item.model.size | humanReadableFileSize}})\">\n                    <i class=\"glyphicon glyphicon-folder-close\"></i>\n                    {{item.model.name | strLimit : 32}}\n                </a>\n            </td>\n            <td class=\"text-right\">\n                <button class=\"btn btn-sm btn-default\" ng-click=\"select(item)\">\n                    <i class=\"glyphicon glyphicon-hand-up\"></i> {{\"select_this\" | translate}}\n                </button>\n            </td>\n        </tr>\n    </tbody>\n</table>");
$templateCache.put("src/templates/main-table.html","<table class=\"table mb0 table-files noselect\">\n    <thead>\n        <tr>\n            <th>\n                <a href=\"\" ng-click=\"order(\'model.name\')\">\n                    {{\"name\" | translate}}\n                    <span class=\"sortorder\" ng-show=\"predicate[1] === \'model.name\'\" ng-class=\"{reverse:reverse}\"></span>\n                </a>\n            </th>\n            <th class=\"hidden-xs\" ng-hide=\"config.hideSize\">\n                <a href=\"\" ng-click=\"order(\'model.size\')\">\n                    {{\"size\" | translate}}\n                    <span class=\"sortorder\" ng-show=\"predicate[1] === \'model.size\'\" ng-class=\"{reverse:reverse}\"></span>\n                </a>\n            </th>\n            <th class=\"hidden-sm hidden-xs\" ng-hide=\"config.hideDate\">\n                <a href=\"\" ng-click=\"order(\'model.date\')\">\n                    {{\"date\" | translate}}\n                    <span class=\"sortorder\" ng-show=\"predicate[1] === \'model.date\'\" ng-class=\"{reverse:reverse}\"></span>\n                </a>\n            </th>\n            <th class=\"hidden-sm hidden-xs\" ng-hide=\"config.hidePermissions\">\n                <a href=\"\" ng-click=\"order(\'model.permissions\')\">\n                    {{\"permissions\" | translate}}\n                    <span class=\"sortorder\" ng-show=\"predicate[1] === \'model.permissions\'\" ng-class=\"{reverse:reverse}\"></span>\n                </a>\n            </th>\n        </tr>\n    </thead>\n    <tbody class=\"file-item\">\n        <tr ng-show=\"fileNavigator.requesting\">\n            <td colspan=\"5\">\n                <div ng-include=\"config.tplPath + \'/spinner.html\'\"></div>\n            </td>\n        </tr>\n        <tr ng-show=\"!fileNavigator.requesting &amp;&amp; fileNavigator.fileList.length < 1 &amp;&amp; !fileNavigator.error\">\n            <td colspan=\"5\">\n                {{\"no_files_in_folder\" | translate}}...\n            </td>\n        </tr>\n        <tr ng-show=\"!fileNavigator.requesting &amp;&amp; fileNavigator.error\">\n            <td colspan=\"5\">\n                {{ fileNavigator.error }}\n            </td>\n        </tr>\n        <tr class=\"item-list\" ng-repeat=\"item in $parent.fileList = (fileNavigator.fileList | filter: {model:{name: query}} | orderBy:predicate:reverse)\" ng-show=\"!fileNavigator.requesting\" ng-click=\"selectOrUnselect(item, $event)\" ng-dblclick=\"smartClick(item)\" ng-right-click=\"selectOrUnselect(item, $event)\" ng-class=\"{selected: isSelected(item)}\">\n            <td>\n                <a href=\"\" title=\"{{item.model.name}} ({{item.model.size | humanReadableFileSize}})\">\n                    <i class=\"glyphicon glyphicon-folder-close\" ng-show=\"item.model.type === \'dir\'\"></i>\n                    <i class=\"glyphicon glyphicon-file\" ng-show=\"item.model.type === \'file\'\"></i>\n                    {{item.model.name | strLimit : 64}}\n                </a>\n            </td>\n            <td class=\"hidden-xs\">\n                <span ng-show=\"item.model.type !== \'dir\' || config.showSizeForDirectories\">\n                    {{item.model.size | humanReadableFileSize}}\n                </span>\n            </td>\n            <td class=\"hidden-sm hidden-xs\" ng-hide=\"config.hideDate\">\n                {{item.model.date | formatDate }}\n            </td>\n            <td class=\"hidden-sm hidden-xs\" ng-hide=\"config.hidePermissions\">\n                {{item.model.perms.toCode(item.model.type === \'dir\'?\'d\':\'-\')}}\n            </td>\n        </tr>\n    </tbody>\n</table>\n");
$templateCache.put("src/templates/main.html","<!--<div ng-controller=\"FileManagerCtrl\" ngf-drop=\"addForUpload($files)\" ngf-drag-over-class=\"\'upload-dragover\'\" ngf-multiple=\"true\">-->\n<div ng-controller=\"FileManagerCtrl\" nv-file-drop=\"\" uploader=\"uploader\" filters=\"queueLimit, customFilter\" nv-file-over=\"\" ngf-drag-over-class=\"\'upload-dragover\'\" ngf-multiple=\"true\">\n    <div ng-include=\"config.tplPath + \'/navbar.html\'\"></div>\n\n    <div class=\"container-fluid\">\n        <div class=\"row\">\n\n            <div class=\"col-sm-4 col-md-3 sidebar file-tree animated slow fadeIn\" ng-include=\"config.tplPath + \'/sidebar.html\'\" ng-show=\"config.sidebar &amp;&amp; fileNavigator.history[0]\">\n            </div>\n\n            <div class=\"main\" ng-class=\"config.sidebar &amp;&amp; fileNavigator.history[0] &amp;&amp; \'col-sm-8 col-md-9\'\">\n                <div ng-include=\"config.tplPath + \'/\' + viewTemplate\" class=\"main-navigation clearfix\"></div>\n            </div>\n        </div>\n    </div>\n\n    <div ng-include=\"config.tplPath + \'/modals.html\'\"></div>\n    <div ng-include=\"config.tplPath + \'/item-context-menu.html\'\"></div>\n</div>\n");
$templateCache.put("src/templates/modals.html","<div class=\"modal fadeIn\" id=\"imagepreview\">\n  <div class=\"modal-dialog\">\n    <div class=\"modal-content\">\n      <div class=\"modal-header\">\n        <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n            <span aria-hidden=\"true\">&times;</span>\n            <span class=\"sr-only\">{{\"close\" | translate}}</span>\n        </button>\n        <h4 class=\"modal-title\">{{\"preview\" | translate}}</h4>\n      </div>\n      <div class=\"modal-body\">\n        <div class=\"text-center\">\n          <img id=\"imagepreview-target\" class=\"preview\" alt=\"{{singleSelection().model.name}}\" ng-class=\"{\'loading\': apiMiddleware.apiHandler.inprocess}\">\n          <span class=\"label label-warning\" ng-show=\"apiMiddleware.apiHandler.inprocess\">{{\'loading\' | translate}} ...</span>\n        </div>\n        <div ng-include data-src=\"\'error-bar\'\" class=\"clearfix\"></div>\n      </div>\n      <div class=\"modal-footer\">\n        <button type=\"button\" class=\"btn btn-default crm-orange\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"close\" | translate}}</button>\n      </div>\n    </div>\n  </div>\n</div>\n\n<div class=\"modal fadeIn\" id=\"remove\">\n  <div class=\"modal-dialog\">\n    <div class=\"modal-content\">\n    <form ng-submit=\"remove()\">\n      <div class=\"modal-header\">\n        <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n            <span aria-hidden=\"true\">&times;</span>\n            <span class=\"sr-only\">{{\"close\" | translate}}</span>\n        </button>\n        <h4 class=\"modal-title\">{{\"confirm\" | translate}}</h4>\n      </div>\n      <div class=\"modal-body\">\n          <span ng-if=\"singleSelection().model.name != \'.Private\'\">{{\'sure_to_delete\' | translate}}</span>\n          <span ng-if=\"singleSelection().model.name == \'.Private\'\">You cannot delete</span>\n          <span ng-include data-src=\"\'selected-files-msg\'\"></span>\n        <div ng-include data-src=\"\'error-bar\'\" class=\"clearfix\"></div>\n      </div>\n      <div class=\"modal-footer\">\n        <button type=\"button\" class=\"btn crm-orange\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"cancel\" | translate}}</button>\n        <button type=\"submit\" class=\"btn crm-green\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\" autofocus=\"autofocus\" ng-if=\"singleSelection().model.name != \'.Private\'\">{{\"remove\" | translate}}</button>\n      </div>\n      </form>\n    </div>\n  </div>\n</div>\n\n<div class=\"modal fadeIn\" id=\"move\">\n  <div class=\"modal-dialog\">\n    <div class=\"modal-content\">\n        <form ng-submit=\"move()\">\n            <div class=\"modal-header\">\n              <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n                  <span aria-hidden=\"true\">&times;</span>\n                  <span class=\"sr-only\">{{\"close\" | translate}}</span>\n              </button>\n              <h4 class=\"modal-title\">{{\'move\' | translate}}</h4>\n            </div>\n            <div class=\"modal-body\">\n              <div ng-include data-src=\"\'path-selector\'\" class=\"clearfix\"></div>\n              <div ng-include data-src=\"\'error-bar\'\" class=\"clearfix\"></div>\n            </div>\n            <div class=\"modal-footer\">\n              <button type=\"button\" class=\"btn crm-orange\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"cancel\" | translate}}</button>\n              <button type=\"submit\" class=\"btn crm-green\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\'move\' | translate}}</button>\n            </div>\n        </form>\n    </div>\n  </div>\n</div>\n\n\n<div class=\"modal fadeIn\" id=\"rename\">\n  <div class=\"modal-dialog\">\n    <div class=\"modal-content\">\n        <form ng-submit=\"rename()\">\n            <div class=\"modal-header\">\n              <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n                  <span aria-hidden=\"true\">&times;</span>\n                  <span class=\"sr-only\">{{\"close\" | translate}}</span>\n              </button>\n              <h4 class=\"modal-title\">{{\'rename\' | translate}}</h4>\n            </div>\n            <div class=\"modal-body\">\n              <label class=\"radio\">{{\'enter_new_name_for\' | translate}} <b>{{singleSelection() && singleSelection().model.name}}</b></label>\n              <input class=\"form-control\" ng-model=\"singleSelection().tempModel.name\" autofocus=\"autofocus\">\n\n              <div ng-include data-src=\"\'error-bar\'\" class=\"clearfix\"></div>\n            </div>\n            <div class=\"modal-footer\">\n              <button type=\"button\" class=\"btn crm-orange\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"cancel\" | translate}}</button>\n              <button type=\"submit\" class=\"btn crm-green\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\'rename\' | translate}}</button>\n            </div>\n        </form>\n    </div>\n  </div>\n</div>\n\n<div class=\"modal fadeIn\" id=\"copy\">\n  <div class=\"modal-dialog\">\n    <div class=\"modal-content\">\n        <form ng-submit=\"copy()\">\n            <div class=\"modal-header\">\n              <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n                  <span aria-hidden=\"true\">&times;</span>\n                  <span class=\"sr-only\">{{\"close\" | translate}}</span>\n              </button>\n              <h4 class=\"modal-title\">{{\'copy_file\' | translate}}</h4>\n            </div>\n            <div class=\"modal-body\">\n              <div ng-show=\"singleSelection()\">\n                <label class=\"radio\">{{\'enter_new_name_for\' | translate}} <b>{{singleSelection().model.name}}</b></label>\n                <input class=\"form-control\" ng-model=\"singleSelection().tempModel.name\" autofocus=\"autofocus\">\n              </div>\n\n              <div ng-include data-src=\"\'path-selector\'\" class=\"clearfix\"></div>\n              <div ng-include data-src=\"\'error-bar\'\" class=\"clearfix\"></div>\n            </div>\n            <div class=\"modal-footer\">\n              <button type=\"button\" class=\"btn crm-orange\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"cancel\" | translate}}</button>\n              <button type=\"submit\" class=\"btn crm-green\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"copy\" | translate}}</button>\n            </div>\n        </form>\n    </div>\n  </div>\n</div>\n\n<div class=\"modal fadeIn\" id=\"compress\">\n  <div class=\"modal-dialog\">\n    <div class=\"modal-content\">\n        <form ng-submit=\"compress()\">\n            <div class=\"modal-header\">\n              <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n                  <span aria-hidden=\"true\">&times;</span>\n                  <span class=\"sr-only\">{{\"close\" | translate}}</span>\n              </button>\n              <h4 class=\"modal-title\">{{\'compress\' | translate}}</h4>\n            </div>\n            <div class=\"modal-body\">\n              <div ng-show=\"apiMiddleware.apiHandler.asyncSuccess\">\n                  <div class=\"label label-success error-msg\">{{\'compression_started\' | translate}}</div>\n              </div>\n              <div ng-hide=\"apiMiddleware.apiHandler.asyncSuccess\">\n                  <div ng-hide=\"config.allowedActions.compressChooseName\">\n                    {{\'sure_to_start_compression_with\' | translate}} <b>{{singleSelection().model.name}}</b> ?\n                  </div>\n                  <div ng-show=\"config.allowedActions.compressChooseName\">\n                    <label class=\"radio\">\n                      {{\'enter_file_name_for_compression\' | translate}}\n                      <span ng-include data-src=\"\'selected-files-msg\'\"></span>\n                    </label>\n                    <input class=\"form-control\" ng-model=\"temp.tempModel.name\" autofocus=\"autofocus\">\n                  </div>\n              </div>\n\n              <div ng-include data-src=\"\'error-bar\'\" class=\"clearfix\"></div>\n            </div>\n            <div class=\"modal-footer\">\n              <div ng-show=\"apiMiddleware.apiHandler.asyncSuccess\">\n                  <button type=\"button\" class=\"btn btn-default\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"close\" | translate}}</button>\n              </div>\n              <div ng-hide=\"apiMiddleware.apiHandler.asyncSuccess\">\n                  <button type=\"button\" class=\"btn crm-orange\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"cancel\" | translate}}</button>\n                  <button type=\"submit\" class=\"btn crm-green\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\'compress\' | translate}}</button>\n              </div>\n            </div>\n        </form>\n    </div>\n  </div>\n</div>\n\n<div class=\"modal fadeIn\" id=\"extract\" ng-init=\"singleSelection().emptyName()\">\n  <div class=\"modal-dialog\">\n    <div class=\"modal-content\">\n        <form ng-submit=\"extract()\">\n            <div class=\"modal-header\">\n              <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n                  <span aria-hidden=\"true\">&times;</span>\n                  <span class=\"sr-only\">{{\"close\" | translate}}</span>\n              </button>\n              <h4 class=\"modal-title\">{{\'extract_item\' | translate}}</h4>\n            </div>\n            <div class=\"modal-body\">\n              <div ng-show=\"apiMiddleware.apiHandler.asyncSuccess\">\n                  <div class=\"label label-success error-msg\">{{\'extraction_started\' | translate}}</div>\n              </div>\n              <div ng-hide=\"apiMiddleware.apiHandler.asyncSuccess\">\n                  <label class=\"radio\">{{\'enter_folder_name_for_extraction\' | translate}} <b>{{singleSelection().model.name}}</b></label>\n                  <input class=\"form-control\" ng-model=\"singleSelection().tempModel.name\" autofocus=\"autofocus\">\n              </div>\n              <div ng-include data-src=\"\'error-bar\'\" class=\"clearfix\"></div>\n            </div>\n            <div class=\"modal-footer\">\n              <div ng-show=\"apiMiddleware.apiHandler.asyncSuccess\">\n                  <button type=\"button\" class=\"btn btn-default\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"close\" | translate}}</button>\n              </div>\n              <div ng-hide=\"apiMiddleware.apiHandler.asyncSuccess\">\n                  <button type=\"button\" class=\"btn crm-orange\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"cancel\" | translate}}</button>\n                  <button type=\"submit\" class=\"btn crm-green\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\'extract\' | translate}}</button>\n              </div>\n            </div>\n        </form>\n    </div>\n  </div>\n</div>\n\n<div class=\"modal fadeIn\" id=\"edit\" ng-class=\"{\'modal-fullscreen\': fullscreen}\">\n  <div class=\"modal-dialog modal-lg\">\n    <div class=\"modal-content\">\n        <form ng-submit=\"edit()\">\n            <div class=\"modal-header\">\n              <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n                  <span aria-hidden=\"true\">&times;</span>\n                  <span class=\"sr-only\">{{\"close\" | translate}}</span>\n              </button>\n              <button type=\"button\" class=\"close fullscreen\" ng-click=\"fullscreen=!fullscreen\">\n                  <i class=\"glyphicon glyphicon-fullscreen\"></i>\n                  <span class=\"sr-only\">{{\'toggle_fullscreen\' | translate}}</span>\n              </button>\n              <h4 class=\"modal-title\">{{\'edit_file\' | translate}}</h4>\n            </div>\n            <div class=\"modal-body\">\n                <label class=\"radio bold\">{{ singleSelection().model.fullPath() }}</label>\n                <span class=\"label label-warning\" ng-show=\"apiMiddleware.apiHandler.inprocess\">{{\'loading\' | translate}} ...</span>\n                <textarea class=\"form-control code\" ng-model=\"singleSelection().tempModel.content\" ng-show=\"!apiMiddleware.apiHandler.inprocess\" autofocus=\"autofocus\"></textarea>\n                <div ng-include data-src=\"\'error-bar\'\" class=\"clearfix\"></div>\n            </div>\n            <div class=\"modal-footer\">\n              <button type=\"button\" class=\"btn crm-orange\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\'close\' | translate}}</button>\n              <button type=\"submit\" class=\"btn crm-green\" ng-show=\"config.allowedActions.edit\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\'edit\' | translate}}</button>\n            </div>\n        </form>\n    </div>\n  </div>\n</div>\n\n<div class=\"modal fadeIn\" id=\"newfolder\">\n  <div class=\"modal-dialog\">\n    <div class=\"modal-content\">\n        <form ng-submit=\"createFolder()\">\n            <div class=\"modal-header\">\n              <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n                  <span aria-hidden=\"true\">&times;</span>\n                  <span class=\"sr-only\">{{\"close\" | translate}}</span>\n              </button>\n              <h4 class=\"modal-title\">{{\'new_folder\' | translate}}</h4>\n            </div>\n            <div class=\"modal-body\">\n              <label class=\"radio\">{{\'folder_name\' | translate}}</label>\n              <input class=\"form-control\" ng-model=\"singleSelection().tempModel.name\" autofocus=\"autofocus\">\n                <span>Private folders can be created by prepending a \".\" before the name (e.g. .MyPrivateFolder)</span>\n              <div ng-include data-src=\"\'error-bar\'\" class=\"clearfix\"></div>\n            </div>\n            <div class=\"modal-footer\">\n              <button type=\"button\" class=\"btn crm-orange\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"cancel\" | translate}}</button>\n              <button type=\"submit\" class=\"btn crm-green\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\'create\' | translate}}</button>\n            </div>\n        </form>\n    </div>\n  </div>\n</div>\n\n<div class=\"modal fadeIn\" id=\"uploadfile\">\n  <div class=\"modal-dialog\">\n    <div class=\"modal-content\">\n        <form ng-submit=\"uploadFiles()\">\n            <div class=\"modal-header\">\n              <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n                  <span aria-hidden=\"true\">&times;</span>\n                  <span class=\"sr-only\">{{\"close\" | translate}}</span>\n              </button>\n              <h4 class=\"modal-title\">{{\"upload_files\" | translate}}</h4>\n            </div>\n            <div class=\"modal-body\">\n              <!--<label  class=\"radio\">\n                {{\"files_will_uploaded_to\" | translate}}\n                <b>/{{fileNavigator.currentPath.join(\'/\')}}</b>\n              </label>\n              <button class=\"btn btn-default btn-block\" ngf-select=\"$parent.addForUpload($files)\" ngf-multiple=\"true\">\n                {{\"select_files\" | translate}}\n              </button>-->\n                <label class=\"radio\">\n                    {{\"files_will_uploaded_to\" | translate}}\n                    <b>/{{fileNavigator.currentPath.join(\'/\')}}</b>\n                </label>\n                <label for=\"emailAttach\" class=\"btn btn-default btn-block\"> Select Files</label>\n                <input id=\"emailAttach\" type=\"file\" nv-file-select uploader=\"uploader\" filters=\"checkfilecsv\" class=\"sr-only custom-file-input\">\n\n                <div class=\"upload-list\">\n                <ul class=\"list-group\">\n                  <li class=\"list-group-item\" ng-repeat=\"(index, uploadFile) in $parent.uploadFileList\">\n                    <button type=\"button\" class=\"btn btn-sm btn-danger pull-right\" ng-click=\"$parent.removeFromUpload(index)\">\n                        &times;\n                    </button>\n                    <h5 class=\"list-group-item-heading\">{{uploadFile.name}}</h5>\n                    <p class=\"list-group-item-text\">{{uploadFile.size | humanReadableFileSize}}</p>\n                  </li>\n                </ul>\n                <!--<div ng-show=\"apiMiddleware.apiHandler.inprocess\">-->\n                    <div>\n                  <!--<em>{{\"uploading\" | translate}}... {{apiMiddleware.apiHandler.progress}}%</em>-->\n                  <div class=\"mb0\">\n                      progress:\n                      <div class=\"progress\" style=\"margin-bottom:20px\">\n                          <div class=\"progress-bar\" role=\"progressbar\" ng-style=\"{ \'width\': uploader.progress + \'%\' }\" style=\"width: 0%;\"></div>\n                      </div>\n                  </div>\n                </div>\n              </div>\n              <div ng-include data-src=\"\'error-bar\'\" class=\"clearfix\"></div>\n\n                <!--<div class=\"well row\">\n                    <label for=\"emailAttach\" class=\"btn crm-green\"><i class=\" fa fa-lg fa-paperclip\"> Select Files</i></label>\n                    <input id=\"emailAttach\" type=\"file\" nv-file-select uploader=\"uploader\" filters=\"checkfilecsv\" class=\"sr-only custom-file-input\">\n                    <div class=\"list-group\">\n                        <a class=\"list-group-item row\" href=\"\" ng-repeat=\"item in attachfile\">\n                            <div class=\"col-lg-10 col-md-10\">\n                                <h5 class=\"list-group-item-heading\">\n                                    {{item.attach_file}}\n                                </h5>\n                                <p class=\"list-group-item-text\">\n                                    Size:{{item.size|number:2}} KB\n                                </p>\n                            </div>\n                            <div class=\"col-lg-2 col-md-2\">\n                                <button type=\"button\" class=\"btn btn-danger btn-xs\" ng-click=\"removeAttachFile(item,actions)\">\n                                    <span class=\"glyphicon glyphicon-trash\"></span> Remove\n                                </button>\n                            </div>\n\n                        </a>\n                    </div>\n                </div>-->\n            </div>\n            <div class=\"modal-footer\">\n              <div>\n                  <button type=\"button\" class=\"btn crm-orange\" data-dismiss=\"modal\" ng-show=\"!$parent.uploadFileList.length\">{{\"cancel\" | translate}}</button>\n                  <button type=\"submit\" class=\"btn crm-green\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\" ng-hide=\"!$parent.uploadFileList.length\">{{\'upload\' | translate}}</button>\n              </div>\n            </div>\n        </form>\n    </div>\n  </div>\n</div>\n\n<div class=\"modal fadeIn\" id=\"changepermissions\">\n  <div class=\"modal-dialog\">\n    <div class=\"modal-content\">\n        <form ng-submit=\"changePermissions()\">\n            <div class=\"modal-header\">\n              <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n                  <span aria-hidden=\"true\">&times;</span>\n                  <span class=\"sr-only\">{{\"close\" | translate}}</span>\n              </button>\n              <h4 class=\"modal-title\">{{\'change_permissions\' | translate}}</h4>\n            </div>\n            <div class=\"modal-body\">\n              <table class=\"table mb0\">\n                  <thead>\n                      <tr>\n                          <th>{{\'permissions\' | translate}}</th>\n                          <th class=\"col-xs-1 text-center\">{{\'read\' | translate}}</th>\n                          <th class=\"col-xs-1 text-center\">{{\'write\' | translate}}</th>\n                          <th class=\"col-xs-1 text-center\">{{\'exec\' | translate}}</th>\n                      </tr>\n                  </thead>\n                  <tbody>\n                      <tr ng-repeat=\"(permTypeKey, permTypeValue) in temp.tempModel.perms\">\n                          <td>{{permTypeKey | translate}}</td>\n                          <td ng-repeat=\"(permKey, permValue) in permTypeValue\" class=\"col-xs-1 text-center\" ng-click=\"main()\">\n                              <label class=\"col-xs-12\">\n                                <input type=\"checkbox\" ng-model=\"temp.tempModel.perms[permTypeKey][permKey]\">\n                              </label>\n                          </td>\n                      </tr>\n                </tbody>\n              </table>\n              <div class=\"checkbox\" ng-show=\"config.enablePermissionsRecursive && selectionHas(\'dir\')\">\n                <label>\n                  <input type=\"checkbox\" ng-model=\"temp.tempModel.recursive\"> {{\'recursive\' | translate}}\n                </label>\n              </div>\n              <div class=\"clearfix mt10\">\n                  <span class=\"label label-primary pull-left\" ng-hide=\"temp.multiple\">\n                    {{\'original\' | translate}}: \n                    {{temp.model.perms.toCode(selectionHas(\'dir\') ? \'d\':\'-\')}} \n                    ({{temp.model.perms.toOctal()}})\n                  </span>\n                  <span class=\"label label-primary pull-right\">\n                    {{\'changes\' | translate}}: \n                    {{temp.tempModel.perms.toCode(selectionHas(\'dir\') ? \'d\':\'-\')}} \n                    ({{temp.tempModel.perms.toOctal()}})\n                  </span>\n              </div>\n              <div ng-include data-src=\"\'error-bar\'\" class=\"clearfix\"></div>\n            </div>\n            <div class=\"modal-footer\">\n              <button type=\"button\" class=\"btn crm-orange\" data-dismiss=\"modal\">{{\"cancel\" | translate}}</button>\n              <button type=\"submit\" class=\"btn crm-green\" ng-disabled=\"\">{{\'change\' | translate}}</button>\n            </div>\n        </form>\n    </div>\n  </div>\n</div>\n\n<div class=\"modal fadeIn\" id=\"selector\" ng-controller=\"ModalFileManagerCtrl\">\n  <div class=\"modal-dialog\">\n    <div class=\"modal-content\">\n      <div class=\"modal-header\">\n        <button type=\"button\" class=\"close\" data-dismiss=\"modal\">\n            <span aria-hidden=\"true\">&times;</span>\n            <span class=\"sr-only\">{{\"close\" | translate}}</span>\n        </button>\n        <h4 class=\"modal-title\">{{\"select_destination_folder\" | translate}}</h4>\n      </div>\n      <div class=\"modal-body\">\n        <div>\n            <div ng-include=\"config.tplPath + \'/current-folder-breadcrumb.html\'\"></div>\n            <div ng-include=\"config.tplPath + \'/main-table-modal.html\'\"></div>\n            <hr />\n            <button class=\"btn btn-sm btn-default\" ng-click=\"selectCurrent()\">\n                <i class=\"glyphicon\"></i> {{\"select_this\" | translate}}\n            </button>\n        </div>\n      </div>\n      <div class=\"modal-footer\">\n        <button type=\"button\" class=\"btn btn-default crm-orange\" data-dismiss=\"modal\" ng-disabled=\"apiMiddleware.apiHandler.inprocess\">{{\"close\" | translate}}</button>\n      </div>\n    </div>\n  </div>\n</div>\n\n<script type=\"text/ng-template\" id=\"path-selector\">\n  <div class=\"panel panel-primary mt10 mb0\">\n    <div class=\"panel-body\">\n        <div class=\"detail-sources\">\n          <div class=\"like-code mr5\"><b>{{\"selection\" | translate}}:</b>\n            <span ng-include=\"\'selected-files-msg\'\"></span>\n          </div>\n        </div>\n        <div class=\"detail-sources\">\n          <div class=\"like-code mr5\">\n            <b>{{\"destination\" | translate}}:</b> {{ getSelectedPath() }}\n          </div>\n          <a href=\"\" class=\"label label-primary\" ng-click=\"openNavigator(fileNavigator.currentPath)\">\n            {{\'change\' | translate}}\n          </a>\n        </div>\n    </div>\n  </div>\n</script>\n\n<script type=\"text/ng-template\" id=\"error-bar\">\n  <div class=\"label label-danger error-msg pull-left fadeIn\" ng-show=\"apiMiddleware.apiHandler.error\">\n    <i class=\"glyphicon glyphicon-remove-circle\"></i>\n    <span>{{apiMiddleware.apiHandler.error}}</span>\n  </div>\n</script>\n\n<script type=\"text/ng-template\" id=\"selected-files-msg\">\n  <span ng-show=\"temps.length == 1\">\n    {{singleSelection().model.name}}\n  </span>\n  <span ng-show=\"temps.length > 1\">\n    {{\'these_elements\' | translate:totalSelecteds()}}\n    <a href=\"\" class=\"label label-primary\" ng-click=\"showDetails = !showDetails\">\n      {{showDetails ? \'-\' : \'+\'}} {{\'details\' | translate}}\n    </a>\n  </span>\n  <div ng-show=\"temps.length > 1 &amp;&amp; showDetails\">\n    <ul class=\"selected-file-details\">\n      <li ng-repeat=\"tempItem in temps\">\n        <b>{{tempItem.model.name}}</b>\n      </li>\n    </ul>\n  </div>\n</script>\n");
$templateCache.put("src/templates/navbar.html","<nav class=\"navbar navbar-inverse green-color\">\n    <div class=\"container-fluid\">\n        <div class=\"row\">\n            <div class=\"col-sm-9 col-md-10 hidden-xs\">\n                <div ng-show=\"!config.breadcrumb\">\n                    <a class=\"navbar-brand hidden-xs ng-binding\" href=\"\">SalesPositive File Manager in the Cloud</a>\n                </div>\n                <div ng-include=\"config.tplPath + \'/current-folder-breadcrumb.html\'\" ng-show=\"config.breadcrumb\">\n                </div>\n            </div>\n            <div class=\"col-sm-3 col-md-2\">\n                <div class=\"navbar-collapse\">\n                    <div class=\"navbar-form navbar-right text-right\">\n                        <div class=\"pull-left visible-xs\" ng-if=\"fileNavigator.currentPath.length\">\n                            <button class=\"btn btn-primary btn-flat\" ng-click=\"fileNavigator.upDir()\">\n                                <i class=\"glyphicon glyphicon-chevron-left\"></i>\n                            </button>\n                            {{fileNavigator.getCurrentFolderName() | strLimit : 12}}\n                        </div>\n                        <div class=\"btn-group\">\n                            <button class=\"btn btn-flat btn-sm dropdown-toggle\" type=\"button\" id=\"dropDownMenuSearch\" data-toggle=\"dropdown\" aria-expanded=\"true\">\n                                <i class=\"glyphicon glyphicon-search mr2\"></i>\n                            </button>\n                            <div class=\"dropdown-menu animated fast fadeIn pull-right\" role=\"menu\" aria-labelledby=\"dropDownMenuLang\">\n                                <input type=\"text\" ng-click=\"$event.stopPropagation()\" class=\"form-control\" ng-show=\"config.searchForm\" placeholder=\"{{\'search\' | translate}}...\" ng-model=\"$parent.query\">\n                            </div>\n                        </div>\n\n                        <button class=\"btn btn-flat btn-sm\" ng-click=\"$parent.setTemplate(\'main-icons.html\')\" ng-show=\"$parent.viewTemplate !==\'main-icons.html\'\" title=\"{{\'icons\' | translate}}\">\n                            <i class=\"glyphicon glyphicon-th-large\"></i>\n                        </button>\n\n                        <!--<button class=\"btn btn-flat btn-sm\" ng-click=\"$parent.setTemplate(\'main-table.html\')\" ng-show=\"$parent.viewTemplate !==\'main-table.html\'\" title=\"{{\'list\' | translate}}\">\n                            <i class=\"glyphicon glyphicon-th-list\"></i>\n                        </button>-->\n\n                        <div class=\"btn-group\">\n                            <button class=\"btn btn-flat btn-sm dropdown-toggle\" type=\"button\" id=\"more\" data-toggle=\"dropdown\" data-dismiss=\"modal\" aria-expanded=false\">\n                                <i class=\"fa fa-ellipsis-v\" style=\"margin-top: 3px\"></i>\n                            </button>\n\n                            <ul class=\"dropdown-menu scrollable-menu animated fast fadeIn pull-right\" role=\"menu\" aria-labelledby=\"more\">\n                                <li role=\"presentation\" ng-show=\"config.allowedActions.createFolder\" ng-click=\"modal(\'newfolder\') && prepareNewFolder()\">\n                                    <a role=\"menuitem\" tabindex=\"-1\">\n                                        <i class=\"glyphicon glyphicon-plus\"></i> {{\"new_folder\" | translate}}\n                                    </a>\n                                </li>\n                                <li role=\"presentation\" ng-show=\"config.allowedActions.upload\" ng-click=\"modal(\'uploadfile\')\">\n                                    <a  role=\"menuitem\" tabindex=\"-1\">\n                                        <i class=\"glyphicon glyphicon-cloud-upload\"></i> {{\"upload_files\" | translate}}\n                                    </a>\n                                </li>\n                            </ul>\n                        </div>\n                    </div>\n                </div>\n            </div>\n        </div>\n    </div>\n</nav>\n");
$templateCache.put("src/templates/remove.html","<!doctype html>\n<html lang=\"en\">\n<head>\n\n    <style>\n        .droptarget {\n            float: left;\n            width: 100px;\n            height: 35px;\n            margin: 15px;\n            padding: 10px;\n            border: 1px solid #aaaaaa;\n        }\n    </style>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n    <title>jQuery UI Droppable - Default functionality</title>\n    <link rel=\"stylesheet\" href=\"//code.jquery.com/ui/1.12.1/themes/base/jquery-ui.css\">\n    <link rel=\"stylesheet\" href=\"/resources/demos/style.css\">\n    <style>\n        #draggable { width: 100px; height: 100px; padding: 0.5em; float: left; margin: 10px 10px 10px 0; }\n        #droppable { width: 150px; height: 150px; padding: 0.5em; float: left; margin: 10px; }\n    </style>\n    <!--<script src=\"https://code.jquery.com/jquery-1.12.4.js\"></script>\n    <script src=\"https://code.jquery.com/ui/1.12.1/jquery-ui.js\"></script>-->\n    <script>\n        $( function() {\n            $( \"#draggable\" ).draggable();\n            $( \"#droppable\" ).droppable({\n                drop: function( event, ui ) {\n                    console.log(ui)\n                    $( this )\n                            .addClass( \"ui-state-highlight\" )\n                            .find( \"p\" )\n                            .html( \"Dropped!\" );\n                }\n            });\n        } );\n    </script>\n</head>\n<body>\n\n<div id=\"draggable\" class=\"ui-widget-content\">\n    <p>Drag me to my target</p>\n</div>\n\n<div id=\"droppable\" class=\"ui-widget-header\">\n    <p>Drop here</p>\n</div>\n\n\n<div class=\"droptarget\" ondrop=\"drop(event)\" ondragover=\"allowDrop(event)\" id=\"1\">\n    <p ondragstart=\"dragStart(event)\" draggable=\"true\" id=\"dragtarget\">Drag me!</p>\n</div>\n\n<div class=\"droptarget\" ondrop=\"drop(event)\" ondragover=\"allowDrop(event)\" id=\"2\"></div>\n\n<p style=\"clear:both;\"><strong>Note:</strong> drag events are not supported in Internet Explorer 8 and earlier versions or Safari 5.1 and earlier versions.</p>\n\n<p id=\"demo\"></p>\n\n\n<script>\n    /* Event fired on the drag target */\n    function dragStart(event) {\n//console.log(event);\n        event.dataTransfer.setData(\"Text\", event.target.id);\n        document.getElementById(\"demo\").innerHTML = \"Started to drag the p element\";\n    }\n\n    /* Events fired on the drop target */\n    function allowDrop(event) {\n//console.log(event);\n        event.preventDefault();\n    }\n\n    function drop(event) {\n\n        console.log(event.target.id)\n        event.preventDefault();\n        var data = event.dataTransfer.getData(\"Text\");\n        event.target.appendChild(document.getElementById(data));\n        document.getElementById(\"demo\").innerHTML = \"The p element was dropped\";\n    }\n</script>\n</body>\n</html>");
$templateCache.put("src/templates/sidebar.html","<ul class=\"nav nav-sidebar file-tree-root\">\n    <li ng-repeat=\"item in fileNavigator.history\" ng-include=\"\'folder-branch-item\'\" ng-class=\"{\'active\': item.name == fileNavigator.currentPath.join(\'/\')}\"></li>\n</ul>\n\n<script type=\"text/ng-template\" id=\"folder-branch-item\">\n    <a href=\"\" ng-click=\"fileNavigator.folderClick(item.item)\" class=\"animated fast fadeInDown\">\n\n        <span class=\"point\">\n            <i class=\"glyphicon glyphicon-chevron-down\" ng-show=\"isInThisPath(item.name)\"></i>\n            <i class=\"glyphicon glyphicon-chevron-right\" ng-show=\"!isInThisPath(item.name)\"></i>\n        </span>\n\n        <i class=\"glyphicon glyphicon-folder-open mr2\" ng-show=\"isInThisPath(item.name)\"></i>\n        <i class=\"glyphicon glyphicon-folder-close mr2\" ng-show=\"!isInThisPath(item.name)\"></i>\n        {{ (item.name.split(\'/\').pop() || fileNavigator.getBasePath().join(\'/\') || \'/\') | strLimit : 30 }}\n    </a>\n    <ul class=\"nav nav-sidebar\">\n        <li ng-repeat=\"item in item.nodes\" ng-include=\"\'folder-branch-item\'\" ng-class=\"{\'active\': item.name == fileNavigator.currentPath.join(\'/\')}\"></li>\n    </ul>\n</script>");
$templateCache.put("src/templates/spinner.html","<div class=\"spinner-wrapper col-xs-12\">\n    <svg class=\"spinner-container\" style=\"width:65px;height:65px\" viewBox=\"0 0 44 44\">\n        <circle class=\"path\" cx=\"22\" cy=\"22\" r=\"20\" fill=\"none\" stroke-width=\"4\"></circle>\n    </svg>\n</div>");}]);