import React, {PropTypes} from 'react';
import {View, Image, Animated} from 'react-native';
import autobind from 'autobind-decorator';
import {createResponder} from 'react-native-gesture-responder';
import TransformableImage from 'react-native-transformable-image';
import ViewPager from '@ldn0x7dc/react-native-view-pager';

export default class Gallery extends React.Component {

    static propTypes = {
        ...View.propTypes,
        images: PropTypes.array,
        initialPage: PropTypes.number,
        pageMargin: PropTypes.number,
        onPageSelected: PropTypes.func,
        onPageScrollStateChanged: PropTypes.func,
        onPageScroll: PropTypes.func,
        onSingleTapConfirmed: PropTypes.func,
        onGalleryStateChanged: PropTypes.func,
        onLongPress: PropTypes.func,
        imageComponent: PropTypes.func,
    };

    static defaultProps = {
        imageComponent: Image,
    };

    state = {
        imagesLoaded: {},
        imagesMounted: {},
    }

    componentWillMount() {
        const imagesMounted = {};
        this.props.images.forEach((image, pageId) => {
            const lowResKey = `lowResImage#${pageId}`;
            const key = `innerImage#${pageId}`;
            imagesMounted[lowResKey] = !!(image.lowResSource);
            imagesMounted[key] = (this.isCurrentPage(pageId) || !image.lowResSource);
            this.animatedValues[key] = new Animated.Value(0.5);
        });

        this.createGestureResponder();
        this.createViewPagerResponder();
        this.createImageResponder();

        this.setState({
            imagesMounted,
        });
    }

    @autobind
    onPageSelected(page) {
        this.currentPage = page;
        if (this.props.onPageSelected) {
            this.props.onPageSelected(page);
        }
    }

    @autobind
    onPageScrollStateChanged(state) {
        if (state === 'idle') {
            this.resetHistoryImageTransform();
        }
        if (this.props.onPageScrollStateChanged) {
            this.props.onPageScrollStateChanged(state);
        }
    }

    @autobind
    onPageScroll(e) {
        if (this.props.onPageScroll) {
            this.props.onPageScroll(e);
        }
    }

    @autobind
    onLoad(pageId, source, imageKey) {
        if (source.uri) {
            Image.getSize(
                source.uri,
                (width, height) => this.onImageDimensions(width, height, pageId, imageKey),
                () => this.setImageLoaded(imageKey, false)
            );
        } else {
            this.setImageLoaded(imageKey, false);
        }
    }

    @autobind
    onImageDimensions(width, height, pageId, imageKey) {
        this.setImageLoaded(imageKey, {width, height});
        if (this.animatedValues[imageKey]) {
            setTimeout(() => {
                Animated.timing(
                    this.animatedValues[imageKey],
                    {
                        useNativeDriver: true,
                        toValue: 1,
                        duration: 200,
                    }
                ).start(() => {
                    this.hideLowRes(pageId);
                });
            });
        }
    }

    @autobind
    getViewPagerInstance() {
        return this.galleryViewPager;
    }

    @autobind
    getCurrentImageTransformer() {
        return this.getImageTransformer(this.currentPage);
    }

    @autobind
    getImageTransformer(page) {
        if (page >= 0 && page < this.pageCount) {
            const ref = this.imageRefs.get(`${page}`);
            if (ref) {
                return ref.getViewTransformerInstance();
            }
        }
        return null;
    }

    @autobind
    setImageLoaded(imageKey, dimensions) {
        if (dimensions) {
            this.imagesDimensions = {
                ...this.imagesDimensions,
                ...dimensions,
            };
        }

        this.setState({
            imagesLoaded: {
                ...this.state.imagesLoaded,
                [imageKey]: true,
            },
        });
    }

    @autobind
    createGestureResponder() {
        function onResponderReleaseOrTerminate(evt, gestureState) {
            if (this.activeResponder) {
                if (this.activeResponder === this.viewPagerResponder &&
                    !this.shouldScrollViewPager(evt, gestureState) &&
                    Math.abs(gestureState.vx) > 0.5) {
                    this.activeResponder.onEnd(evt, gestureState, true);
                    this.getViewPagerInstance().flingToPage(this.currentPage, gestureState.vx);
                } else {
                    this.activeResponder.onEnd(evt, gestureState);
                }
                this.activeResponder = null;
            }
            this.firstMove = true;
            if (this.props.onGalleryStateChanged) {
                this.props.onGalleryStateChanged(true);
            }
        }

        this.gestureResponder = createResponder({
            onStartShouldSetResponderCapture: () => true,
            onStartShouldSetResponder: () => true,
            onResponderGrant: (evt, gestureState) => {
                this.activeImageResponder(evt, gestureState);
            },
            onResponderMove: (evt, gestureState) => {
                const passOn = gestureState;
                if (this.firstMove) {
                    this.firstMove = false;
                    if (this.shouldScrollViewPager(evt, gestureState)) {
                        this.activeViewPagerResponder(evt, gestureState);
                    }
                    if (this.props.onGalleryStateChanged) {
                        this.props.onGalleryStateChanged(false);
                    }
                }
                if (this.activeResponder === this.viewPagerResponder) {
                    const dx = gestureState.moveX - gestureState.previousMoveX;
                    const offset = this.getViewPagerInstance().getScrollOffsetFromCurrentPage();
                    if (dx > 0 && offset > 0 && !this.shouldScrollViewPager(evt, gestureState)) {
                        if (dx > offset) { // active image responder
                            this.getViewPagerInstance().scrollByOffset(offset);
                            passOn.moveX -= offset;
                            this.activeImageResponder(evt, gestureState);
                        }
                    } else if (
                        dx < 0 &&
                        offset < 0 &&
                        !this.shouldScrollViewPager(evt, gestureState)
                    ) {
                        if (dx < offset) { // active image responder
                            this.getViewPagerInstance().scrollByOffset(offset);
                            passOn.moveX -= offset;
                            this.activeImageResponder(evt, gestureState);
                        }
                    }
                }
                this.activeResponder.onMove(evt, passOn);
            },
            onResponderRelease: onResponderReleaseOrTerminate.bind(this),
            onResponderTerminate: onResponderReleaseOrTerminate.bind(this),
            // Do not allow parent view to intercept gesture
            onResponderTerminationRequest: () => false,
            onResponderSingleTapConfirmed: () => {
                if (this.props.onSingleTapConfirmed) {
                    this.props.onSingleTapConfirmed(this.currentPage);
                }
            },
        });
    }

    @autobind
    createViewPagerResponder() {
        this.viewPagerResponder = {
            onStart: (evt, gestureState) => {
                this.getViewPagerInstance().onResponderGrant(evt, gestureState);
            },
            onMove: (evt, gestureState) => {
                this.getViewPagerInstance().onResponderMove(evt, gestureState);
            },
            onEnd: (evt, gestureState, disableSettle) => {
                this.getViewPagerInstance().onResponderRelease(evt, gestureState, disableSettle);
            },
        };
    }

    @autobind
    createImageResponder() {
        this.imageResponder = {
            onStart: (evt, gestureState) => {
                const transformer = this.getCurrentImageTransformer();
                if (transformer) {
                    transformer.onResponderGrant(evt, gestureState);
                }
                if (this.props.onLongPress) {
                    this.longPressTimeout = setTimeout(() => {
                        this.props.onLongPress(gestureState);
                    }, 600);
                }
            },
            onMove: (evt, gestureState) => {
                const transformer = this.getCurrentImageTransformer();
                if (transformer) {
                    transformer.onResponderMove(evt, gestureState);
                }
                clearTimeout(this.longPressTimeout);
            },
            onEnd: (evt, gestureState) => {
                const transformer = this.getCurrentImageTransformer();
                if (transformer) {
                    transformer.onResponderRelease(evt, gestureState);
                }
                clearTimeout(this.longPressTimeout);
            },
        };
    }

    @autobind
    hideLowRes(pageId) {
        const key = `lowResImage#${pageId}`;
        this.setState({
            imagesMounted: {
                ...this.state.imagesMounted,
                [key]: false,
            },
        });
    }

    @autobind
    activeViewPagerResponder(evt, gestureState) {
        if (this.activeResponder !== this.viewPagerResponder) {
            if (this.activeResponder === this.imageResponder) {
                this.imageResponder.onEnd(evt, gestureState);
            }
            this.activeResponder = this.viewPagerResponder;
            this.viewPagerResponder.onStart(evt, gestureState);
        }
    }

    @autobind
    activeImageResponder(evt, gestureState) {
        if (this.activeResponder !== this.imageResponder) {
            if (this.activeResponder === this.viewPagerResponder) {
                // pass true to disable ViewPager settle
                this.viewPagerResponder.onEnd(evt, gestureState, true);
            }
            this.activeResponder = this.imageResponder;
            this.imageResponder.onStart(evt, gestureState);
        }
    }

    @autobind
    shouldScrollViewPager(evt, gestureState) {
        if (gestureState.numberActiveTouches > 1) {
            return false;
        }
        const viewTransformer = this.getCurrentImageTransformer();
        if (!viewTransformer) {
            return false;
        }
        const space = viewTransformer.getAvailableTranslateSpace();
        const dx = gestureState.moveX - gestureState.previousMoveX;

        if (dx > 0 && space.left <= 0 && this.currentPage > 0) {
            return true;
        }
        if (dx < 0 && space.right <= 0 && this.currentPage < this.pageCount - 1) {
            return true;
        }
        return false;
    }

    imageRefs = new Map();
    activeResponder = undefined;
    firstMove = true;
    currentPage = 0;
    pageCount = 0;
    gestureResponder = undefined;
    animatedValues = [];
    galleryViewPager = null;
    imagesDimensions = {};

    @autobind
    isCurrentPage(pageId) {
        return parseInt(pageId) === this.currentPage;
    }

    @autobind
    isAroundCurrentPage(pageId) {
        const iPageId = parseInt(pageId);
        const iCurrent = parseInt(this.currentPage);
        if (iPageId === iCurrent) {
            return true;
        }
        if (iPageId === iCurrent + 1) {
            return true;
        }
        if (iPageId === iCurrent - 1) {
            return true;
        }
        return false;
    }

    @autobind
    isInitialPage(pageId) {
        return parseInt(pageId) === this.props.initialPage;
    }

    @autobind
    resetHistoryImageTransform() {
        let transformer = this.getImageTransformer(this.currentPage + 1);
        if (transformer) {
            transformer.forceUpdateTransform({scale: 1, translateX: 0, translateY: 0});
        }

        transformer = this.getImageTransformer(this.currentPage - 1);
        if (transformer) {
            transformer.forceUpdateTransform({scale: 1, translateX: 0, translateY: 0});
        }
    }

    @autobind
    renderPage(pageData, pageId, layout) {
        const lowResKey = `lowResImage#${pageId}`;
        const key = `innerImage#${pageId}`;
        return (
            <View
              style={{width: layout.width, height: layout.height}}
            >
                {this.state.imagesMounted[lowResKey]
                    ? this.renderLowRes(pageData, pageId, layout)
                    : null
                }
                {this.state.imagesMounted[key]
                    ? this.renderHighRes(
                        pageData,
                        pageId,
                        layout,
                        this.state.imagesMounted[lowResKey] ?
                            {backgroundColor: 'transparent'} : {}
                    )
                    : null
                }
            </View>
        );
    }

    @autobind
    renderLowRes(pageData, pageId, layout) {
        const {style, ...props} = this.props;
        const key = `lowResImage#${pageId}`;

        if (!this.isAroundCurrentPage(pageId)) {
            return (
                <View
                  {...props}
                  key={key}
                  style={[{width: layout.width, height: layout.height}, this.props.style]}
                />
            );
        }

        return this.renderTransformable(
            pageData.lowResSource,
            pageData.dimensions,
            pageId,
            key,
            layout
        );
    }

    @autobind
    renderHighRes(pageData, pageId, layout, styles) {
        const {style, ...props} = this.props;
        const key = `innerImage#${pageId}`;

        if (!this.isAroundCurrentPage(pageId)) {
            return (
                <View
                  {...props}
                  key={key}
                  style={[{width: layout.width, height: layout.height}, style]}
                />
            );
        }

        return (
            <Animated.View
              style={[
                  this.props.style,
                  {
                      width: layout.width,
                      height: layout.height,
                  },
                  this.isInitialPage(pageId) ? {} : {opacity: this.animatedValues[key]},
                  styles,
              ]}
            >
                {this.renderTransformable(
                    pageData.source,
                    pageData.dimensions,
                    pageId,
                    key,
                    layout
                )}
            </Animated.View>
        );
    }

    renderTransformable(source, dimensions, pageId, key, layout) {
        const {onViewTransformed, onTransformGestureReleased, loader, style, ...props} = this.props;
        const loaded = this.state.imagesLoaded[key] && this.state.imagesLoaded[key] === true;
        const loadingView = !loaded && loader ? loader : false;

        return (
            <TransformableImage
              {...props}
              onLoad={() => {
                  this.onLoad(pageId, source, key);
              }}
              onViewTransformed={((transform) => {
                  if (onViewTransformed) {
                      onViewTransformed(transform, pageId);
                  }
              })}
              onTransformGestureReleased={((transform) => {
                  if (onTransformGestureReleased) {
                      onTransformGestureReleased(transform, pageId);
                  }
              })}
              ref={((ref) => { this.imageRefs.set(pageId, ref); })}
              style={[
                  style,
                  {
                      width: layout.width,
                      height: layout.height,
                      backgroundColor: 'transparent',
                  },
              ]}
              source={source}
              pixels={
                  this.imagesDimensions[key]
                  || dimensions
                  || {}
              }
              imageComponent={this.props.imageComponent}
            >
                { loadingView }
            </TransformableImage>
        );
    }

    render() {
        let gestureResponder = this.gestureResponder;

        let images = this.props.images;
        if (!images) {
            images = [];
        }
        this.pageCount = images.length;

        if (this.pageCount <= 0) {
            gestureResponder = {};
        }

        return (
            <ViewPager
              {...this.props}
              ref={(galleryViewPager) => { this.galleryViewPager = galleryViewPager; }}
              scrollEnabled={false}
              renderPage={this.renderPage}
              pageDataArray={images}
              {...gestureResponder}
              onPageSelected={this.onPageSelected}
              onPageScrollStateChanged={this.onPageScrollStateChanged}
              onPageScroll={this.onPageScroll}
            />
        );
    }
}
